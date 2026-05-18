## ADDED Requirements

### Requirement: SmtpSender sends outgoing mail

`mailbrus-core` SHALL provide a `SmtpSender` that sends a pre-composed RFC 5322 message via SMTP using io-smtp coroutines, supporting PLAIN auth and STARTTLS.

#### Scenario: Send a message successfully

- **WHEN** `SmtpSender::send(config, message_bytes)` is called with a valid SMTP host, port, PLAIN credentials, and RFC 5322 message bytes
- **THEN** it connects to the server, authenticates, delivers the message, and returns `Ok(())`

#### Scenario: STARTTLS upgrade

- **WHEN** `SmtpSender::send` is called with `starttls: true` against a server on port 587
- **THEN** the connection is upgraded to TLS before authentication proceeds
- **AND** the message is delivered after the upgrade

#### Scenario: Authentication failure

- **WHEN** `SmtpSender::send` is called with invalid credentials
- **THEN** it returns an error containing the SMTP rejection reason
- **AND** no message is delivered

### Requirement: SmtpSender accepts credentials at call site

`SmtpSender::send` SHALL accept SMTP credentials as parameters. No account configuration storage is managed by this capability.

#### Scenario: Credentials passed at call site

- **WHEN** `SmtpSender::send` is called with username and password parameters
- **THEN** those credentials are used for authentication without reading from any config file or environment variable
