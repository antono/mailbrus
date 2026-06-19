## ADDED Requirements

### Requirement: Reply to sender
The reader SHALL provide an `r` action that opens the compose screen prefilled as a
reply to the open message's sender. The `To` field SHALL be set to the original
message's `From` address. The `Subject` SHALL be the original subject prefixed with
`Re: `, not duplicated if the subject already begins with `Re:` (case-insensitive). The
compose body SHALL contain the original message body quoted, with each line prefixed by
`> ` (greater-than then a single space). `r` SHALL be active only when the reader is the
active scope and focus is not in a text input.

#### Scenario: r opens compose addressed to the sender
- **WHEN** the reader is open on a message and the user presses `r`
- **THEN** the compose screen opens with the `To` field set to the original message's `From` address

#### Scenario: Original body is quoted with "> " prefix
- **WHEN** the user presses `r` in the reader
- **THEN** the compose body contains the original message text with each line prefixed by `> `

#### Scenario: Subject gets a single Re: prefix
- **WHEN** the user replies to a message whose subject is `Hello`
- **THEN** the compose subject is `Re: Hello`

#### Scenario: Re: is not duplicated
- **WHEN** the user replies to a message whose subject is already `Re: Hello`
- **THEN** the compose subject remains `Re: Hello` (no `Re: Re:`)

#### Scenario: r suppressed while typing
- **WHEN** focus is in an `input` or `textarea` and the user presses `r`
- **THEN** the character is typed normally and no reply is started

### Requirement: Reply to all
The reader SHALL provide an `R` (Shift+r) action that opens the compose screen as a
reply to every participant of the open message. The `To` field SHALL contain the
original `From` address; the `Cc` field SHALL contain the union of the original `To`
and `Cc` recipients. The active account's own address SHALL be excluded from both
fields. Subject prefixing and body quoting SHALL follow the same rules as `r`.

#### Scenario: R populates To and Cc from all participants
- **WHEN** the reader is open on a message with multiple recipients and the user presses `R`
- **THEN** the compose `To` is the original `From` and the `Cc` contains the other original `To`/`Cc` recipients

#### Scenario: Own address excluded from reply-all
- **WHEN** the user presses `R` on a message that also listed the active account's own address as a recipient
- **THEN** the active account's address does not appear in the `To` or `Cc` fields

#### Scenario: Reply-all quotes the original body
- **WHEN** the user presses `R` in the reader
- **THEN** the compose body contains the original message text with each line prefixed by `> `

### Requirement: Forward message
The reader SHALL provide an `F` (Shift+f) action that opens the compose screen to
forward the open message. The `To` field SHALL be empty, the `Subject` SHALL be the
original subject prefixed with `Fwd: ` (not duplicated), and the body SHALL contain the
forwarded original message including its `From`, `To`, `Subject`, and `Date` headers
followed by the original body. `F` SHALL NOT interfere with `f`, which remains hint mode.

#### Scenario: F opens compose to forward
- **WHEN** the reader is open and the user presses `F`
- **THEN** the compose screen opens with an empty `To` and the subject prefixed with `Fwd: `

#### Scenario: Forwarded body includes original headers
- **WHEN** the user presses `F` in the reader
- **THEN** the compose body includes the original message's `From`, `To`, `Subject`, and `Date` followed by the original body

#### Scenario: f still activates hint mode
- **WHEN** the reader is open (text/simple mode) and the user presses `f`
- **THEN** hint mode activates and no forward is started

### Requirement: Yank message body
The reader SHALL provide a `y` action that copies the open message's plain-text body to
the system clipboard. The copied content SHALL be the body only, without headers.

#### Scenario: y copies the body to the clipboard
- **WHEN** the reader is open and the user presses `y`
- **THEN** the system clipboard contains the message's plain-text body and no headers

### Requirement: Yank message with headers
The reader SHALL provide a `Y` (Shift+y) action that copies the open message's common
headers followed by its body to the system clipboard. The headers SHALL include at
least `From`, `To`, and `Subject`, plus `Date` and `Cc` when present, each on its own
line, followed by a blank line and then the plain-text body.

#### Scenario: Y copies headers and body
- **WHEN** the reader is open and the user presses `Y`
- **THEN** the system clipboard contains `From`, `To`, and `Subject` lines (and `Date`/`Cc` when present) followed by a blank line and the message body

### Requirement: Headers menu toggle
The reader SHALL provide a `g h` leader sequence that toggles the headers menu (the
`HeadersPopover`) showing the message's full header set. Pressing `g h` again or
`Escape` SHALL close it.

#### Scenario: g h opens the headers menu
- **WHEN** the reader is open and the user presses `g` then `h` within the leader timeout
- **THEN** the headers menu opens showing the message's full headers

#### Scenario: g h closes an open headers menu
- **WHEN** the headers menu is open and the user presses `g` then `h`
- **THEN** the headers menu closes
