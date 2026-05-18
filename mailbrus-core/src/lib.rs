/// Returns the mailbrus version string.
///
/// ```
/// assert!(!mailbrus_core::version().is_empty());
/// ```
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
