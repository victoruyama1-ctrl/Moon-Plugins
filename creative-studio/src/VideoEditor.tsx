"use client";

import dynamic from "next/dynamic";
import type { Id } from "@moon/convex-data-model";

/**
 * VideoEditor Component
 *
 * This component wraps the Elah Editor-based Creative Studio.
 * Elah is an open-source, browser-native video editing engine with:
 *
 * - Frame-accurate timeline (integer frames, no floating-point drift)
 * - WebGL2 GPU-accelerated preview and export
 * - Multi-track audio support
 * - Video, audio, image, text, shape, and freehand clip types
 * - Transform overlays (drag, resize, rotate)
 * - MP4 export with deterministic output
 * - Full undo/redo history
 * - Interactive timeline (drag, trim, split, snap)
 *
 * Features:
 * - Drag media into the asset panel to import
 * - Drop media onto timeline to create clips
 * - Keyboard shortcuts: Space=play, S=split, Delete=remove, Ctrl+Z=undo
 * - Real-time preview with audio playback
 * - Export to MP4 (matching preview pixel-perfectly)
 *
 * Resources:
 * - Website: https://www.elah.dev
 * - GitHub: https://github.com/elahlabs/elah
 * - Docs: https://www.elah.dev/docs
 * - Discord: https://discord.gg/8CeZ2XbPy
 */

interface VideoEditorProps {
  projectId?: Id<"creativeProjects"> | string;
}

// Dynamic import to avoid SSR issues with Elah's WebGL2 and WebCodecs APIs
const CreativeStudioElah = dynamic(
  () => import("./CreativeStudioElah"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full bg-black">
        <div className="text-center">
          <p className="text-slate-400 text-lg mb-2">Loading Creative Studio...</p>
          <p className="text-slate-500 text-sm">Initializing Elah Editor</p>
        </div>
      </div>
    ),
  }
);

export default function VideoEditor({ projectId }: VideoEditorProps) {
  return (
    <div className="video-editor-shell h-full min-h-0 min-w-[1024px] overflow-hidden">
      <CreativeStudioElah projectId={projectId} />
    </div>
  );
}
