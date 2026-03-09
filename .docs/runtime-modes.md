# Runtime modes

T3 Code has a global runtime mode switch in the chat toolbar:

- **Full access** (default): starts sessions with `approvalPolicy: never` and `sandboxMode: danger-full-access`.
- **Supervised**: starts sessions with `approvalPolicy: on-request` and `sandboxMode: workspace-write`, then prompts in-app for command/file approvals.

## Interaction modes

The chat toolbar also has an interaction-mode toggle:

- **Chat**: the normal execution mode.
- **Plan**: switches the provider into plan-first collaboration so the assistant focuses on exploration, clarification, and producing a detailed plan instead of directly executing the work.

When a plan is active, T3 Code can also show a **plan sidebar** so the current plan stays visible while you continue the conversation.

The plan sidebar also supports:

- copying the current plan to the clipboard
- downloading the plan as markdown
- saving the plan into the current workspace
