## MODIFIED Requirements

### Requirement: Active scope and scope stack
The frontend SHALL maintain a single ordered stack of *active scopes* where each scope is one of
`list`, `reader`, `compose`, `palette`, `modal`, or `hint`. The top of the stack is the active scope.
Every view SHALL push its scope when it mounts and pop the same scope when it unmounts. The stack SHALL
never be empty; `list` is the base scope at app boot.

Popping a scope SHALL remove the most-recent occurrence of that scope wherever it sits in the stack,
not only the top. Scoped views can layer (e.g. the command palette opens over the reader) and a
layered view's action can dismiss the view beneath it, so a scope may be popped while another scope
still sits above it. Removing by identity keeps the active scope (the stack tip) correct and leaves no
stale scope behind. A pop of a scope that is not present in the stack at all is a programming error and
SHALL fail loudly.

#### Scenario: Boot stack
- **WHEN** the app first mounts at the message list
- **THEN** the scope stack is `['list']` and the active scope is `list`

#### Scenario: Opening the reader pushes
- **WHEN** the user opens a message from the list
- **THEN** the scope stack becomes `['list', 'reader']` and the active scope is `reader`

#### Scenario: Closing the reader pops
- **WHEN** the reader is open and the user closes it
- **THEN** the scope stack returns to `['list']` and the active scope is `list`

#### Scenario: Modal layers over reader
- **WHEN** the reader is open and the user opens keyboard help
- **THEN** the scope stack becomes `['list', 'reader', 'modal']` and the active scope is `modal`

#### Scenario: Hint mode layers over its host scope
- **WHEN** the user presses `f` to enter hint mode in the reader
- **THEN** the scope stack becomes `['list', 'reader', 'hint']` and the active scope is `hint`

#### Scenario: A layered view dismisses the view beneath it
- **WHEN** the stack is `['list', 'reader', 'palette']` and a palette action closes the reader underneath the still-open palette
- **THEN** the `reader` scope is removed and the stack becomes `['list', 'palette']` with the active scope still `palette`, and closing the palette then returns to `['list']`

#### Scenario: Popping an absent scope fails loudly in development
- **WHEN** a view attempts to pop a scope that is not present anywhere in the stack
- **THEN** the pop SHALL throw in development builds and SHALL be logged as an error in release builds
