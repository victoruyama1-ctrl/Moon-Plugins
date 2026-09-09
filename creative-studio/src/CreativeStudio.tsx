"use client";

import { useEffect, useState } from "react";
import CreativeStudioDashboard from "./CreativeStudioDashboard";
import VideoEditor from "./VideoEditor";

export default function CreativeStudioPlugin() {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    const readProject = () => {
      const queryProject = new URLSearchParams(window.location.search).get("project");
      const pathProject = window.location.pathname.match(/^\/creative\/([^/]+)/)?.[1] ?? null;
      setProjectId(queryProject ?? pathProject);
    };
    readProject();
    window.addEventListener("popstate", readProject);
    return () => window.removeEventListener("popstate", readProject);
  }, []);

  return projectId ? <VideoEditor projectId={projectId} /> : <CreativeStudioDashboard />;
}