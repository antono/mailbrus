use crate::sanitize::{html_to_text, sanitize_html};
use mail_parser::{MessageParser, MimeHeaders, PartType};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use mailbrus_core::maildir_reader::Message;
use tracing::debug;

pub struct ParsedMessage {
    pub headers: Map<String, Value>,
    pub text_body: String,
    pub html_body: String,
    pub has_plain: bool,
    pub has_html: bool,
    pub format_flowed: bool,
    /// cid → (content-type, raw bytes)
    #[allow(dead_code)]
    pub cid_parts: HashMap<String, (String, Vec<u8>)>,
    pub attachments: Vec<Value>,
}

pub fn message_to_json(m: &Message) -> Value {
    let from = m.headers.from.as_deref().unwrap_or("");
    let addr = if let (Some(s), Some(e)) = (from.find('<'), from.rfind('>')) {
        from[s + 1..e].to_string()
    } else {
        from.to_string()
    };
    let time = m.headers.date.map(|d| d.to_string()).unwrap_or_default();
    json!({
        "id": m.id,
        "from": from,
        "addr": addr,
        "subject": m.headers.subject.as_deref().unwrap_or("(no subject)"),
        "preview": "",
        "time": time,
        "unread": !m.flags.seen,
        "flags": "",
    })
}

pub fn extract_message(raw: &[u8]) -> Option<ParsedMessage> {
    let msg = MessageParser::new().parse(raw)?;
    let raw_bytes = msg.raw_message.as_ref();

    let mut headers: Map<String, Value> = Map::new();
    if let Some(root) = msg.parts.first() {
        for h in &root.headers {
            let name = h.name().to_string();
            let value = std::str::from_utf8(
                &raw_bytes[h.offset_start as usize..h.offset_end as usize],
            )
            .unwrap_or("")
            .trim()
            .to_string();
            headers
                .entry(name)
                .or_insert_with(|| Value::Array(vec![]))
                .as_array_mut()
                .unwrap()
                .push(Value::String(value));
        }
    }

    let mut text_body = String::new();
    let mut format_flowed = false;
    for &pid in &msg.text_body {
        if let Some(part) = msg.parts.get(pid as usize) {
            if let PartType::Text(text) = &part.body {
                text_body = text.as_ref().to_string();
                format_flowed = part
                    .content_type()
                    .and_then(|ct| ct.attribute("format"))
                    .map(|f| f.eq_ignore_ascii_case("flowed"))
                    .unwrap_or(false);
                break;
            }
        }
    }

    let mut html_body = String::new();
    for &pid in &msg.html_body {
        if let Some(part) = msg.parts.get(pid as usize) {
            if let PartType::Html(html) = &part.body {
                html_body = html.as_ref().to_string();
                break;
            }
        }
    }

    let has_plain = !text_body.is_empty();
    let has_html = !html_body.is_empty();

    let mut cid_parts: HashMap<String, (String, Vec<u8>)> = HashMap::new();
    for part in &msg.parts {
        if let Some(cid) = part.content_id() {
            let cid = cid.trim_matches(['<', '>']).to_string();
            let mime = part
                .content_type()
                .map(|ct| {
                    format!(
                        "{}/{}",
                        ct.c_type,
                        ct.c_subtype.as_deref().unwrap_or("octet-stream")
                    )
                })
                .unwrap_or_else(|| "application/octet-stream".to_string());
            let bytes = match &part.body {
                PartType::Binary(b) | PartType::InlineBinary(b) => b.as_ref().to_vec(),
                PartType::Text(t) => t.as_bytes().to_vec(),
                _ => continue,
            };
            cid_parts.insert(cid, (mime, bytes));
        }
    }

    let mut attachments: Vec<Value> = Vec::new();
    for &pid in &msg.attachments {
        if let Some(part) = msg.parts.get(pid as usize) {
            let mime = part
                .content_type()
                .map(|ct| {
                    format!(
                        "{}/{}",
                        ct.c_type,
                        ct.c_subtype.as_deref().unwrap_or("octet-stream")
                    )
                })
                .unwrap_or_else(|| "application/octet-stream".to_string());
            let name = part
                .content_disposition()
                .and_then(|cd| cd.attribute("filename"))
                .or_else(|| part.content_type().and_then(|ct| ct.attribute("name")))
                .unwrap_or("unnamed");
            let size = match &part.body {
                PartType::Binary(b) | PartType::InlineBinary(b) => b.len(),
                PartType::Text(t) => t.len(),
                _ => 0,
            };
            attachments.push(json!({"name": name, "size": size, "mime": mime, "part_index": pid as usize}));
        }
    }
    for &pid in &msg.html_body {
        if let Some(part) = msg.parts.get(pid as usize) {
            if let PartType::Html(h) = &part.body {
                attachments.push(json!({"name": "message.html", "size": h.len(), "mime": "text/html", "part_index": pid as usize}));
            }
        }
    }

    Some(ParsedMessage {
        headers,
        text_body,
        html_body,
        has_plain,
        has_html,
        format_flowed,
        cid_parts,
        attachments,
    })
}

/// Collect the recipients of a `To`/`Cc` style header out of the parsed header
/// map into a flat list of addressable strings.
fn recipient_list(headers: &Map<String, Value>, key: &str) -> Vec<String> {
    headers
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .flat_map(mailbrus_core::maildir_reader::split_address_list)
                .collect()
        })
        .unwrap_or_default()
}

pub fn build_body_response(id: &str, parsed: ParsedMessage, mode: &str) -> Value {
    let ParsedMessage {
        headers,
        text_body,
        html_body,
        has_plain,
        has_html,
        format_flowed,
        attachments,
        ..
    } = parsed;

    let resolved_mode = match mode {
        "html" => "html",
        "simple" => "simple",
        "text" => "text",
        _ => {
            if has_plain {
                "text"
            } else {
                "simple"
            }
        }
    };

    let (body, has_remote) = match resolved_mode {
        "html" => {
            if has_html {
                sanitize_html(id, &html_body)
            } else {
                let escaped = ammonia::clean(&format!("<pre>{text_body}</pre>"));
                (escaped, 0)
            }
        }
        "simple" => {
            let source = if has_html { &html_body } else { &text_body };
            (html_to_text(source), 0)
        }
        _ => (text_body, 0),
    };

    // Structured recipient lists for reply-all on the client. The raw `To`/`Cc`
    // header strings live in `headers`; split them into addressable recipients
    // using the same parser the list path uses.
    let to = recipient_list(&headers, "To");
    let cc = recipient_list(&headers, "Cc");

    debug!(
        "[mime] build_body_response id={} mode={} has_plain={} has_html={} has_remote={}",
        id, resolved_mode, has_plain, has_html, has_remote
    );

    json!({
        "id": id,
        "headers": headers,
        "body": body,
        "to": to,
        "cc": cc,
        "mode": resolved_mode,
        "has_plain": has_plain,
        "has_html": has_html,
        "has_remote": has_remote,
        "format_flowed": format_flowed,
        "attachments": attachments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_message_detects_html_only() {
        let raw = b"From: Test <t@x.com>\r\nTo: me@x.com\r\nSubject: S\r\n\
Date: Sat, 22 May 2026 09:00:00 +0000\r\nMessage-ID: <t@x.com>\r\nMIME-Version: 1.0\r\n\
Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\
<p>Hello</p>\r\n";
        let parsed = extract_message(raw).expect("should parse");
        assert!(parsed.has_html, "html-only message must set has_html=true");
        assert!(!parsed.has_plain, "html-only message must have has_plain=false");
        assert!(parsed.html_body.contains("<p>Hello</p>"));
        let html_att = parsed.attachments.iter().find(|a| a["mime"] == "text/html")
            .expect("html body must appear as attachment");
        assert_eq!(html_att["name"], "message.html");
        assert!(html_att["part_index"].is_number(), "part_index must be present");
        assert!(html_att["size"].as_u64().unwrap_or(0) > 0, "size must be > 0");
    }

    #[test]
    fn extract_message_detects_html_only_fixture() {
        let fixture_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("e2e/fixtures/maildir/alice@example.com/Inbox/cur/alice-inbox-07-html-only:2,S");
        let raw = std::fs::read(&fixture_path)
            .unwrap_or_else(|_| panic!("fixture not found: {}", fixture_path.display()));
        let parsed = extract_message(&raw).expect("should parse fixture");
        assert!(parsed.has_html, "html-only fixture must set has_html=true, got has_html={} has_plain={}", parsed.has_html, parsed.has_plain);
        assert!(!parsed.has_plain, "html-only fixture must have has_plain=false, got has_plain={}", parsed.has_plain);
    }

    #[test]
    fn attachment_entries_carry_part_index() {
        let boundary = "=_att_=";
        let raw = format!(
            "From: Test <t@x.com>\r\nTo: me@x.com\r\nSubject: S\r\n\
Date: Sat, 22 May 2026 09:00:00 +0000\r\nMessage-ID: <att@x.com>\r\nMIME-Version: 1.0\r\n\
Content-Type: multipart/mixed; boundary=\"{boundary}\"\r\n\r\n\
--{boundary}\r\nContent-Type: text/plain\r\n\r\nHello\r\n\
--{boundary}\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename=\"doc.pdf\"\r\n\r\nPDF\r\n\
--{boundary}--\r\n"
        );
        let parsed = extract_message(raw.as_bytes()).expect("should parse");
        let pdf = parsed.attachments.iter().find(|a| a["mime"] == "application/pdf")
            .expect("pdf attachment must be present");
        assert!(pdf["part_index"].is_number(), "part_index must be present on regular attachment");
    }

    #[test]
    fn extract_message_detects_multipart_alternative() {
        let boundary = "=_alt_=";
        let raw = format!(
            "From: Test <t@x.com>\r\nTo: me@x.com\r\nSubject: S\r\n\
Date: Sat, 22 May 2026 09:00:00 +0000\r\nMessage-ID: <t@x.com>\r\nMIME-Version: 1.0\r\n\
Content-Type: multipart/alternative; boundary=\"{boundary}\"\r\n\r\n\
--{boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\
Plain text\r\n\
--{boundary}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\
<p>HTML</p>\r\n\
--{boundary}--\r\n"
        );
        let parsed = extract_message(raw.as_bytes()).expect("should parse");
        assert!(parsed.has_html, "multipart/alt must set has_html=true");
        assert!(parsed.has_plain, "multipart/alt must set has_plain=true");
        assert!(parsed.html_body.contains("<p>HTML</p>"));
        assert!(parsed.text_body.contains("Plain text"));
        let html_att = parsed.attachments.iter().find(|a| a["mime"] == "text/html")
            .expect("html body part must appear as attachment in multipart/alt");
        assert_eq!(html_att["name"], "message.html");
        assert!(html_att["part_index"].is_number());
    }

    #[test]
    fn plain_text_message_has_no_html_attachment() {
        // mail_parser may include text/plain parts in html_body for single-part messages;
        // extract_message must not turn them into message.html attachment pills.
        let raw = b"From: Test <t@x.com>\r\nTo: me@x.com\r\nSubject: S\r\n\
Date: Mon, 18 May 2026 09:15:00 +0000\r\nMessage-ID: <t@x.com>\r\nMIME-Version: 1.0\r\n\
Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\
Hi Alice,\r\n\r\nPlanning notes.\r\n\r\nThanks,\r\nMallory\r\n\r\n-- \r\nMallory Admin\r\n";
        let parsed = extract_message(raw).expect("extract");
        assert!(parsed.attachments.is_empty(), "plain text must have no attachments: {:?}", parsed.attachments);
    }
}
