use tracing::debug;

/// Run ammonia allowlist pass then lol_html cid/src rewrite.
/// Returns (sanitized_html, has_remote_count).
pub fn sanitize_html(msg_id: &str, raw_html: &str) -> (String, usize) {
    use ammonia::Builder;
    use std::collections::HashSet;

    // ammonia allowlist pass — defaults already strip on*, id, name, style,
    // script/iframe/form/etc. We only need to add cid: to url_schemes so
    // cid: src attributes survive for the lol_html rewrite below.
    let mut url_schemes = HashSet::new();
    url_schemes.insert("cid");
    let clean = Builder::new()
        .add_url_schemes(url_schemes)
        .clean(raw_html)
        .to_string();

    debug!(
        "[render] ammonia pass: {} input bytes → {} output bytes",
        raw_html.len(),
        clean.len()
    );

    // lol_html rewrite pass: cid:X → /api/messages/:id/cid/X, remote src → data-mb-src
    let rewritten = rewrite_resources(msg_id, &clean);
    let has_remote = rewritten.matches("data-mb-src=").count();

    debug!(
        "[render] lol_html pass: {} remote resources neutralized",
        has_remote
    );

    (rewritten, has_remote)
}

fn rewrite_resources(msg_id: &str, html: &str) -> String {
    use lol_html::{element, HtmlRewriter, Settings};

    let msg_id = msg_id.to_string();
    let mut output: Vec<u8> = Vec::with_capacity(html.len());

    let result = {
        let mut rewriter = HtmlRewriter::new(
            Settings {
                element_content_handlers: vec![element!("img[src]", move |el| {
                    let src = el.get_attribute("src").unwrap_or_default();
                    if let Some(cid) = src.strip_prefix("cid:") {
                        el.set_attribute(
                            "src",
                            &format!("/api/messages/{msg_id}/cid/{cid}"),
                        )?;
                    } else if src.starts_with("http://") || src.starts_with("https://") {
                        el.set_attribute("data-mb-src", &src)?;
                        el.remove_attribute("src");
                    }
                    Ok(())
                })],
                ..Settings::new()
            },
            |c: &[u8]| output.extend_from_slice(c),
        );
        rewriter
            .write(html.as_bytes())
            .and_then(|_| rewriter.end())
    };

    if result.is_err() {
        return html.to_string();
    }

    String::from_utf8_lossy(&output).into_owned()
}

pub fn html_to_text(html: &str) -> String {
    html2text::from_read(html.as_bytes(), 100)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_script_tags() {
        let (out, _) = sanitize_html("id1", "<p>hi</p><script>alert(1)</script>");
        assert!(!out.contains("<script"), "script tag must be stripped");
        assert!(out.contains("hi"));
    }

    #[test]
    fn sanitize_strips_on_event_handlers() {
        let (out, _) = sanitize_html("id1", r#"<img src="x" onerror="alert(1)">"#);
        assert!(!out.contains("onerror"), "on* handlers must be stripped");
    }

    #[test]
    fn sanitize_strips_javascript_href() {
        let (out, _) = sanitize_html("id1", r#"<a href="javascript:alert(1)">click</a>"#);
        assert!(!out.contains("javascript:"), "javascript: href must be stripped");
    }

    #[test]
    fn sanitize_rewrites_cid_src() {
        let (out, remote) =
            sanitize_html("msg42", r#"<img src="cid:logo@example.com" alt="logo">"#);
        assert!(
            out.contains("/api/messages/msg42/cid/logo@example.com"),
            "cid: must be rewritten to api path"
        );
        assert_eq!(remote, 0, "cid is not a remote resource");
    }

    #[test]
    fn sanitize_neutralizes_remote_src() {
        let (out, remote) =
            sanitize_html("id1", r#"<img src="https://tracker.evil/p.gif" alt="">"#);
        assert!(!out.contains(" src=\"http"), "remote src must be neutralized");
        assert!(out.contains("data-mb-src="), "remote src moved to data-mb-src");
        assert_eq!(remote, 1);
    }

    #[test]
    fn sanitize_strips_iframe_element() {
        let (out, _) = sanitize_html("id1", "<iframe src='evil'></iframe>");
        assert!(!out.contains("<iframe"), "iframe must be stripped");
    }

    #[test]
    fn sanitize_strips_form_elements() {
        let (out, _) = sanitize_html("id1", "<form action='/steal'><input type='text'></form>");
        assert!(!out.contains("<form"), "form must be stripped");
        assert!(!out.contains("<input"), "input must be stripped");
    }

    #[test]
    fn sanitize_strips_meta_refresh() {
        let (out, _) = sanitize_html("id1", r#"<meta http-equiv="refresh" content="0;url=https://evil.example/phish"><p>Loading...</p>"#);
        eprintln!("meta-refresh output: {:?}", out);
        assert!(!out.contains("<meta"), "meta must be stripped: got {:?}", out);
    }
}
