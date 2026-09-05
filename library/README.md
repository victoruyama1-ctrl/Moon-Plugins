# Library Plugin

Workspace asset library plugin for Moon.

## Package

- `plugin.json` describes the plugin entry point, permissions, capabilities, and upload limits.
- `src/host.ts` defines the bridge Moon provides to the plugin.
- `src/Library.tsx` is the independent plugin UI.
- `convex/files.ts` contains the backend contract that must be deployed with the host Convex project.

The Moon application remains responsible for authentication, workspace membership, storage, and rendering the plugin entry point. The plugin does not import Moon application files.
