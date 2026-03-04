# Subagent Routing Configuration

## Agents Created
- **coder**: Full-stack web development agent (nvidia/moonshotai/kimi-k2.5)
- **bobby**: Decision-making agent (openrouter/google/gemini-2.5-flash-lite)

## Routing Rules
- **coder**: Handles coding tasks in `telegram:discussions` channel
- **bobby**: Handles all other Telegram messages (default routing)
- **main**: Default agent for non-Telegram channels

## Usage Guidelines
- Send coding tasks to `telegram:discussions` channel → routed to coder
- Send decision questions to any other channel → routed to bobby
- Main agent remains unchanged for direct interactions

## Model Configuration
- coder: Primary model nvidia/moonshotai/kimi-k2.5, fallback openrouter/auto
- bobby: Primary model openrouter/google/gemini-2.5-flash-lite
- main: Default openrouter/arcee-ai/trinity-large-preview:free

## Workspace
All agents share: ~/.openclaw/workspace