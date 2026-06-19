use clap::Parser;
use std::net::{IpAddr, SocketAddr};

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum LogLevel {
    /// Full responses and request bodies
    #[value(name = "debug")]
    Debug,
    /// Request/response metadata only (method, path, status)
    #[value(name = "info")]
    Info,
    /// Key events only (startup, shutdown, errors)
    #[value(name = "warn")]
    Warn,
}

#[derive(Parser)]
#[command(name = "mailbrus-server", version)]
pub struct Cli {
    #[arg(long, default_value = "127.0.0.1:1371")]
    pub bind: String,
    #[arg(long, default_value = "./build")]
    pub frontend_dist: std::path::PathBuf,
    #[arg(long)]
    pub auth: Option<String>,
    /// Open the default web browser at the server URL after startup
    #[arg(long)]
    pub browser: bool,
    /// Log level: debug (full responses), info (metadata only), warn (key events)
    #[arg(long, default_value = "info", value_enum)]
    pub log_level: LogLevel,
    /// Base config directory. Accounts are read from `<dir>/accounts/*.toml`.
    /// Defaults to $XDG_CONFIG_HOME/mailbrus/ (typically ~/.config/mailbrus/).
    #[arg(long)]
    pub config: Option<std::path::PathBuf>,
    /// Deprecated and ignored. Mailbrus always owns an isolated notmuch database
    /// rooted at $XDG_DATA_HOME/mailbrus/. Passing this flag logs a warning.
    #[arg(long, hide = true)]
    pub notmuch_db: Option<std::path::PathBuf>,
}

pub fn browser_url(addr: SocketAddr) -> String {
    match addr.ip() {
        IpAddr::V4(v4) if v4.is_unspecified() => format!("http://127.0.0.1:{}", addr.port()),
        IpAddr::V6(v6) if v6.is_unspecified() => format!("http://[::1]:{}", addr.port()),
        IpAddr::V4(v4) => format!("http://{}:{}", v4, addr.port()),
        IpAddr::V6(v6) => format!("http://[{}]:{}", v6, addr.port()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ephemeral_port_uses_real_port() {
        let addr: SocketAddr = "127.0.0.1:54321".parse().unwrap();
        assert_eq!(browser_url(addr), "http://127.0.0.1:54321");
    }

    #[test]
    fn unspecified_ipv4_maps_to_loopback() {
        let addr: SocketAddr = "0.0.0.0:9000".parse().unwrap();
        assert_eq!(browser_url(addr), "http://127.0.0.1:9000");
    }

    #[test]
    fn unspecified_ipv6_maps_to_loopback() {
        let addr: SocketAddr = "[::]:9000".parse().unwrap();
        assert_eq!(browser_url(addr), "http://[::1]:9000");
    }

    #[test]
    fn specific_ipv4_passes_through() {
        let addr: SocketAddr = "192.168.1.10:8080".parse().unwrap();
        assert_eq!(browser_url(addr), "http://192.168.1.10:8080");
    }
}
