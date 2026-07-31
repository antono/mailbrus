use crate::{cli::LogLevel, state::AppState};
use axum::{
    extract::State,
    http::{
        header::{AUTHORIZATION, CACHE_CONTROL, HOST},
        HeaderValue, Method, Request, StatusCode,
    },
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Mark every API response `Cache-Control: no-store`.
///
/// API payloads (maildirs, folders, message lists) are dynamic — they change on
/// every sync. Without this header the browser's HTTP cache may serve a stale
/// response (e.g. an empty inbox captured before the first sync), which looks
/// like data loss. The notmuch index is the single source of truth, so API
/// responses must never be cached by the browser.
pub async fn no_store_middleware(req: Request<axum::body::Body>, next: Next) -> Response {
    let mut res = next.run(req).await;
    res.headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    res
}

/// Cache policy for the statically-served SPA.
///
/// Vite emits content-hashed assets under `/_app/immutable/` whose contents never
/// change for a given URL — those can be cached forever. The SPA shell
/// (`index.html`, served for `/` and as the SPA fallback) MUST NOT be cached: each
/// rebuild produces new hashed chunk names, so a browser holding a stale shell
/// would request deleted chunks (404) and fail to boot, or boot the old app — the
/// classic "rebuilt the app but the browser is stuck on the old one" failure. The
/// shell is marked `no-cache` (revalidate every load; ServeDir's ETag/Last-Modified
/// keep that a cheap 304). `/api/*` is handled separately by `no_store_middleware`.
pub async fn static_cache_middleware(req: Request<axum::body::Body>, next: Next) -> Response {
    let immutable = req.uri().path().starts_with("/_app/immutable/");
    let mut res = next.run(req).await;
    let value = if immutable {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    res.headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static(value));
    res
}

pub async fn log_middleware(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = req.method().to_string();
    let uri = req.uri().to_string();

    let res = next.run(req).await;
    let status = res.status();

    match state.log_level {
        LogLevel::Debug => {
            debug!("[api] {} {} -> {}", method, uri, status);
        }
        LogLevel::Info => {
            info!("[api] {} {} -> {}", method, uri, status);
        }
        LogLevel::Warn => {
            if status.is_server_error() || status.is_client_error() {
                warn!("[api] {} {} -> {}", method, uri, status);
            }
        }
    }

    res
}

/// Origin-validation configuration carried by the security middlewares.
///
/// Cheaply clonable (all fields are `Arc`/`Option`), so it can back several
/// `from_fn_with_state` layers. See the `api-origin-validation` capability spec.
#[derive(Clone)]
pub struct SecurityConfig {
    /// Allowlist of acceptable request authorities (`host:port`) — the
    /// DNS-rebinding (CWE-346) defense. `None` disables host checking; see
    /// [`build_host_allowlist`].
    pub allowed_hosts: Option<Arc<HashSet<String>>>,
    /// Bearer token required on `/api/*`. `None` disables the auth gate.
    pub auth_token: Option<Arc<String>>,
}

/// Build the `Host`-header allowlist for a bound address.
///
/// A loopback bind gets the strict set of loopback authorities. A specific
/// non-loopback IP additionally allows its own `host:port`, so legitimate remote
/// access keeps working. An unspecified bind (`0.0.0.0` / `[::]`) returns `None`:
/// the intended external host is unknown, so host checking is disabled and
/// `--auth` becomes the operative control (a non-loopback bind without `--auth`
/// already warns at startup).
pub fn build_host_allowlist(addr: SocketAddr) -> Option<HashSet<String>> {
    if addr.ip().is_unspecified() {
        return None;
    }
    let port = addr.port();
    let mut set = HashSet::new();
    set.insert(format!("127.0.0.1:{port}"));
    set.insert(format!("localhost:{port}"));
    set.insert(format!("[::1]:{port}"));
    if !addr.ip().is_loopback() {
        set.insert(addr.to_string());
    }
    Some(set)
}

/// Decide whether a request authority is allowed. `None` allowlist = allow all.
fn host_allowed(allowed: &Option<Arc<HashSet<String>>>, authority: Option<&str>) -> bool {
    match allowed {
        None => true,
        Some(set) => authority.map(|a| set.contains(a)).unwrap_or(false),
    }
}

/// Decide whether an unsafe (state-changing) request should be blocked as
/// cross-site. Safe methods are never blocked; only an explicit
/// `Sec-Fetch-Site: cross-site`/`same-site` on an unsafe method is rejected.
fn is_cross_site_blocked(method: &Method, sec_fetch_site: Option<&str>) -> bool {
    let unsafe_method = matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    );
    unsafe_method && matches!(sec_fetch_site, Some("cross-site") | Some("same-site"))
}

/// Constant-time byte equality. Length is allowed to leak (standard for token
/// comparison); content comparison runs in time independent of the mismatch
/// position to avoid a timing side channel.
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Decide whether the `Authorization` header satisfies the configured token.
/// `None` expected token = no gate (always ok).
fn token_ok(expected: Option<&str>, auth_header: Option<&str>) -> bool {
    match expected {
        None => true,
        Some(exp) => auth_header
            .and_then(|h| h.strip_prefix("Bearer "))
            .map(|t| ct_eq(t.as_bytes(), exp.as_bytes()))
            .unwrap_or(false),
    }
}

/// Reject requests whose `Host`/`:authority` is not on the allowlist (403).
///
/// Placed as the **outermost** layer so it guards both `/api/*` and the static
/// SPA shell. This is the primary DNS-rebinding (CWE-346) defense: `Host` is the
/// one value a rebinding page cannot forge.
pub async fn host_guard_middleware(
    State(cfg): State<SecurityConfig>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let authority = req
        .headers()
        .get(HOST)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .or_else(|| req.uri().authority().map(|a| a.as_str().to_owned()));
    if host_allowed(&cfg.allowed_hosts, authority.as_deref()) {
        next.run(req).await
    } else {
        warn!(
            "[security] rejected request with disallowed Host: {:?}",
            authority
        );
        (StatusCode::FORBIDDEN, "forbidden: invalid host").into_response()
    }
}

/// Reject cross-site state-changing requests (403).
///
/// Belt-and-suspenders behind [`host_guard_middleware`]: closes the residual
/// CSRF vector on no-body endpoints (e.g. `POST /api/sync`) that browsers send
/// as CORS-"simple" requests without a preflight.
pub async fn cross_site_guard_middleware(req: Request<axum::body::Body>, next: Next) -> Response {
    let site = req
        .headers()
        .get("sec-fetch-site")
        .and_then(|v| v.to_str().ok());
    if is_cross_site_blocked(req.method(), site) {
        warn!("[security] rejected cross-site {} request", req.method());
        return (StatusCode::FORBIDDEN, "forbidden: cross-site request").into_response();
    }
    next.run(req).await
}

/// Enforce the bearer token on `/api/*` when one is configured (401 otherwise).
/// A no-op when `--auth` is unset.
pub async fn auth_middleware(
    State(cfg): State<SecurityConfig>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    if token_ok(cfg.auth_token.as_ref().map(|t| t.as_str()), header) {
        next.run(req).await
    } else {
        (StatusCode::UNAUTHORIZED, "unauthorized").into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn addr(s: &str) -> SocketAddr {
        s.parse().unwrap()
    }

    #[test]
    fn allowlist_loopback_includes_standard_authorities() {
        let set = build_host_allowlist(addr("127.0.0.1:1371")).unwrap();
        assert!(set.contains("127.0.0.1:1371"));
        assert!(set.contains("localhost:1371"));
        assert!(set.contains("[::1]:1371"));
    }

    #[test]
    fn allowlist_unspecified_disables_check() {
        assert!(build_host_allowlist(addr("0.0.0.0:1371")).is_none());
        assert!(build_host_allowlist(addr("[::]:1371")).is_none());
    }

    #[test]
    fn allowlist_specific_nonloopback_includes_itself() {
        let set = build_host_allowlist(addr("192.168.1.10:8080")).unwrap();
        assert!(set.contains("192.168.1.10:8080"));
        assert!(set.contains("127.0.0.1:8080"));
    }

    #[test]
    fn host_allowed_accepts_loopback_rejects_foreign() {
        let set = build_host_allowlist(addr("127.0.0.1:1371")).map(Arc::new);
        assert!(host_allowed(&set, Some("127.0.0.1:1371")));
        assert!(host_allowed(&set, Some("localhost:1371")));
        assert!(!host_allowed(&set, Some("evil.example.com")));
        assert!(!host_allowed(&set, Some("127.0.0.1:9999")));
        assert!(!host_allowed(&set, None));
    }

    #[test]
    fn host_allowed_passes_when_no_allowlist() {
        assert!(host_allowed(&None, Some("anything")));
        assert!(host_allowed(&None, None));
    }

    #[test]
    fn cross_site_blocks_unsafe_cross_site() {
        assert!(is_cross_site_blocked(&Method::POST, Some("cross-site")));
        assert!(is_cross_site_blocked(&Method::DELETE, Some("same-site")));
        assert!(is_cross_site_blocked(&Method::PATCH, Some("cross-site")));
    }

    #[test]
    fn cross_site_allows_same_origin_and_missing() {
        assert!(!is_cross_site_blocked(&Method::POST, Some("same-origin")));
        assert!(!is_cross_site_blocked(&Method::POST, Some("none")));
        assert!(!is_cross_site_blocked(&Method::POST, None));
    }

    #[test]
    fn cross_site_ignores_safe_methods() {
        assert!(!is_cross_site_blocked(&Method::GET, Some("cross-site")));
        assert!(!is_cross_site_blocked(&Method::HEAD, Some("cross-site")));
    }

    #[test]
    fn token_ok_requires_match_when_set() {
        assert!(token_ok(Some("s3cret"), Some("Bearer s3cret")));
        assert!(!token_ok(Some("s3cret"), Some("Bearer wrong")));
        assert!(!token_ok(Some("s3cret"), Some("s3cret"))); // missing Bearer prefix
        assert!(!token_ok(Some("s3cret"), None));
    }

    #[test]
    fn token_ok_passes_when_unset() {
        assert!(token_ok(None, None));
        assert!(token_ok(None, Some("Bearer whatever")));
    }
}
