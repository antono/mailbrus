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
            attachments.push(json!({"name": name, "size": size, "mime": mime}));
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

    debug!(
        "[mime] build_body_response id={} mode={} has_plain={} has_html={} has_remote={}",
        id, resolved_mode, has_plain, has_html, has_remote
    );

    json!({
        "id": id,
        "headers": headers,
        "body": body,
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
    }
}
