"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AudioLines, Bot, Film, Image as ImageIcon, Layers3, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@moon/convex-api";
import type { Id } from "@moon/convex-data-model";
import { playStudioSound } from "./studio-interactions";
import { navigate } from "./navigation";

type ProjectType = "video" | "image" | "audio" | "design";
type Project = { _id: Id<"creativeProjects">; name: string; type: ProjectType; width: number; height: number; updatedAt: number; previewUrl?: string; previewType?: "image" | "video" };

type Category = { type: ProjectType; label: string; description: string; icon: typeof Film; iconTone: string; image: string };

const categories: Category[] = [
  { type: "video", label: "Video", description: "Edit videos, create ads, and social clips.", icon: Film, iconTone: "studio-icon-violet", image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=700&q=85" },
  { type: "image", label: "Image", description: "Edit photos, remove backgrounds, add text.", icon: ImageIcon, iconTone: "studio-icon-green", image: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=700&q=85" },
  { type: "audio", label: "Audio", description: "Edit music, record, mix, and add music.", icon: AudioLines, iconTone: "studio-icon-coral", image: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=700&q=85" },
  { type: "design", label: "Design", description: "Posters, flyers, social media graphics.", icon: Layers3, iconTone: "studio-icon-pink", image: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=700&q=85" },
];

const aiCategory = { label: "AI Studio", description: "Generate, edit and enhance with AI.", icon: Bot, iconTone: "studio-icon-blue", image: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=700&q=85" };
const projectDefaults: Record<ProjectType, { width: number; height: number; duration?: number }> = { video: { width: 1920, height: 1080, duration: 0 }, image: { width: 1080, height: 1080 }, audio: { width: 0, height: 0, duration: 0 }, design: { width: 1080, height: 1080 } };
const recentArtwork = [
  "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=640&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=640&q=80",
  "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=640&q=80",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=640&q=80",
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=640&q=80",
];
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(timestamp);

export default function CreativeStudioDashboard() {
  const [username, setUsername] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<Id<"workspaces"> | null>(null);
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ProjectType>("video");
  const [projectName, setProjectName] = useState("Untitled project");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<Id<"creativeProjects"> | null>(null);
  const hoverSoundPending = useRef(false);
  const projectScrollerRef = useRef<HTMLDivElement>(null);
  const projectDragRef = useRef<{ startX: number; startScrollLeft: number; moved: boolean; pointerId: number } | null>(null);
  const suppressProjectClickRef = useRef(false);
  const workspaces = useQuery(api.workspaces.listForUser, username ? { username } : "skip");
  const projects = useQuery(api.creativeProjects.listForWorkspace, username && workspaceId ? { username, workspaceId } : "skip") as Project[] | undefined;
  const createProject = useMutation(api.creativeProjects.create);
  const removeProject = useMutation(api.creativeProjects.remove);

  useEffect(() => {
    fetch("/api/auth/current").then(async (response) => { const data = await response.json().catch(() => null); if (response.ok && data?.user?.username) setUsername(data.user.username); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    playStudioSound("/sounds/apphover2.mp3", 0.08);
  }, []);
  useEffect(() => { if (!workspaceId && workspaces?.[0]?.id) { const handle = window.setTimeout(() => setWorkspaceId(workspaces[0].id), 0); return () => window.clearTimeout(handle); } }, [workspaceId, workspaces]);

  const playHoverSound = () => {
    if (hoverSoundPending.current) return;
    hoverSoundPending.current = true;
    playStudioSound("/sounds/hover.mp3", 0.14);
    window.setTimeout(() => { hoverSoundPending.current = false; }, 180);
  };
  const playClickSound = () => playStudioSound("/sounds/click.mp3", 0.26);
  const updatePointerGlow = (event: React.PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);
  };

  const filteredProjects = useMemo(() => { const query = search.trim().toLowerCase(); return (projects ?? []).filter((project) => !query || `${project.name} ${project.type}`.toLowerCase().includes(query)); }, [projects, search]);
  const openNewProject = (type: ProjectType = "video") => { setSelectedType(type); setNewProjectOpen(true); setError(null); };
  const submitProject = async (type = selectedType) => {
    if (!username || !workspaceId || !projectName.trim()) return;
    setCreating(true); setError(null);
    try { const projectId = await createProject({ username, workspaceId, name: projectName, type, ...projectDefaults[type] }); setNewProjectOpen(false); setProjectName("Untitled project"); navigate(`/creative?project=${projectId}`); }
    catch (createError) { setError(createError instanceof Error ? createError.message : "Could not create the project."); }
    finally { setCreating(false); }
  };
  const deleteProject = async (project: Project) => {
    if (!username || deletingProjectId) return;
    if (!window.confirm(`Delete ${project.name}? This removes its media and timeline permanently.`)) return;
    setDeletingProjectId(project._id);
    try {
      playClickSound();
      const cloudinaryAssets = await removeProject({ username, projectId: project._id });
      localStorage.removeItem(`moon-creative-local:${project._id}`);
      await Promise.allSettled(cloudinaryAssets.map((asset) => fetch("/api/media/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(asset) })));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the project.");
    } finally {
      setDeletingProjectId(null);
    }
  };
  const startProjectDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[aria-label^="Delete "]')) return;
    projectDragRef.current = { startX: event.clientX, startScrollLeft: event.currentTarget.scrollLeft, moved: false, pointerId: event.pointerId };
  };
  const moveProjectDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = projectDragRef.current;
    if (!drag) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 4) {
      drag.moved = true;
      if (!event.currentTarget.hasPointerCapture(drag.pointerId)) event.currentTarget.setPointerCapture(drag.pointerId);
    }
    event.currentTarget.scrollLeft = drag.startScrollLeft - distance;
  };
  const stopProjectDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = projectDragRef.current;
    projectDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag?.moved) return;
    suppressProjectClickRef.current = true;
    window.setTimeout(() => { suppressProjectClickRef.current = false; }, 0);
  };
  const openProject = (project: Project) => {
    if (suppressProjectClickRef.current) {
      suppressProjectClickRef.current = false;
      return;
    }
    playClickSound();
    navigate(`/creative?project=${project._id}`);
  };

  return (
    <main className="creative-home relative h-full min-h-0 min-w-[1024px] w-full overflow-hidden text-white" onPointerMove={updatePointerGlow}>
      <div className="creative-home-stars" aria-hidden="true" /><div className="creative-home-moon" aria-hidden="true" />
      <div className="creative-cursor-orb" aria-hidden="true" />
      <div className="creative-home-content mx-auto max-w-6xl px-5 pb-5 pt-5 sm:px-8 sm:pt-8 lg:px-10">
        <header className="relative z-10 text-center">
          <div className="mb-3 flex items-center justify-center gap-1.5 text-sm font-semibold tracking-tight"><span>Moon</span><span className="text-fuchsia-300">Creative Studio</span></div>
          <p className="text-[9px] text-slate-400">Create. Edit. Design. All in one place.</p>
          <div className="mx-auto mt-5 flex w-full max-w-[560px] flex-row flex-nowrap gap-2">
            <label onMouseEnter={playHoverSound} className="creative-home-search flex h-10 flex-1 items-center gap-2 rounded-lg border px-3 text-left"><Search className="h-3.5 w-3.5 shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your projects, templates, or tools..." className="min-w-0 flex-1 bg-transparent text-[10px] text-white outline-none placeholder:text-slate-500" /></label>
            <button type="button" onMouseEnter={playHoverSound} onClick={() => { playClickSound(); openNewProject(); }} className="creative-new-project inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-[10px] font-semibold text-white"><Plus className="h-3.5 w-3.5" /> New Project</button>
          </div>
        </header>

        <div className="relative z-10 mt-5 grid gap-2.5 lg:gap-3" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          {categories.map(({ type, label, description, icon: Icon, iconTone, image }, index) => <button key={type} type="button" onMouseEnter={playHoverSound} onClick={() => { playClickSound(); openNewProject(type); }} className="creative-mode-card group text-left" style={{ animationDelay: `${index * 55}ms` }}><span className={`creative-mode-icon ${iconTone}`}><Icon className="h-4 w-4" /></span><span className="mt-2 block text-[12px] font-semibold">{label}</span><span className="mt-1 block min-h-7 text-[8px] leading-3 text-slate-400">{description}</span><span className="creative-mode-art" aria-hidden="true"><img src={image} alt="" /></span></button>)}
          <button type="button" onMouseEnter={playHoverSound} onClick={() => { playClickSound(); openNewProject("design"); }} className="creative-mode-card group text-left" style={{ animationDelay: "220ms" }}><span className={`creative-mode-icon ${aiCategory.iconTone}`}><Bot className="h-4 w-4" /></span><span className="mt-2 block text-[12px] font-semibold">{aiCategory.label}</span><span className="mt-1 block min-h-7 text-[8px] leading-3 text-slate-400">{aiCategory.description}</span><span className="creative-mode-art" aria-hidden="true"><img src={aiCategory.image} alt="" /></span></button>
        </div>

        <section className="creative-recent-projects relative z-10 mt-3"><div className="mb-2 flex items-center justify-between"><h2 className="text-[11px] font-semibold sm:text-xs">Recent Projects</h2><span className="text-[9px] text-slate-400">{filteredProjects.length > 0 ? "Slide to browse →" : "Your workspace"}</span></div>{projects === undefined ? <div className="creative-project-empty">Loading projects...</div> : filteredProjects.length > 0 ? <div ref={projectScrollerRef} onPointerDown={startProjectDrag} onPointerMove={moveProjectDrag} onPointerUp={stopProjectDrag} onPointerCancel={stopProjectDrag} onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY; }} className="creative-project-grid flex snap-x snap-mandatory select-none gap-2 overflow-x-auto overflow-y-hidden pb-2">{filteredProjects.map((project, index) => <div key={project._id} className="group relative shrink-0 snap-start"><button type="button" draggable={false} onMouseEnter={playHoverSound} onClick={() => openProject(project)} className="creative-project-tile block w-full select-none text-left" style={{ animationDelay: `${index * 65}ms` }}><span className="creative-project-image pointer-events-none block aspect-[1.75] overflow-hidden rounded-md border border-white/10 bg-slate-900">{project.previewUrl ? project.previewType === "video" ? <video draggable={false} src={project.previewUrl} muted loop autoPlay playsInline disablePictureInPicture controlsList="nodownload noplaybackrate" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <img draggable={false} src={project.previewUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <img draggable={false} src={recentArtwork[index % recentArtwork.length]} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}</span><span className="pointer-events-none mt-1.5 block truncate text-[8px] font-medium text-slate-200">{project.name}</span><span className="pointer-events-none mt-0.5 block text-[7px] text-slate-500">{formatDate(project.updatedAt)}</span></button><button type="button" disabled={deletingProjectId === project._id} onMouseEnter={playHoverSound} onClick={(event) => { event.stopPropagation(); void deleteProject(project); }} aria-label={`Delete ${project.name}`} title="Delete project" className="absolute right-1 top-1 z-10 rounded-md bg-rose-500/90 p-1.5 text-white opacity-0 shadow-lg transition group-hover:opacity-100 hover:bg-rose-400 disabled:cursor-wait disabled:opacity-70"><Trash2 className="h-3 w-3" /></button></div>)}</div> : <div className="creative-project-empty">No projects yet. Create your first project above.</div>}</section>
  <div className="relative z-10 mt-6 flex items-center justify-center gap-2 text-[9px] text-slate-500"><Sparkles className="h-3 w-3 text-fuchsia-300" /> Your ideas, in motion.</div>
      </div>

      {newProjectOpen && <div className="creative-modal-backdrop"><section className="creative-modal creative-new-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title"><div className="flex items-start justify-between gap-4"><div><h2 id="new-project-title" className="text-sm font-semibold text-white">Create New Project</h2><p className="mt-2 text-[9px] leading-4 text-slate-500">Choose the type of project you want to create</p></div><button type="button" onClick={() => setNewProjectOpen(false)} aria-label="Close new project dialog" title="Close" className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button></div><label className="creative-project-title-field">Project title<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Untitled project" /></label><div className="creative-project-type-grid">{categories.map(({ type, label, description, icon: Icon, iconTone }) => <button key={type} type="button" disabled={creating || !workspaceId} onClick={() => { setSelectedType(type); void submitProject(type); }} className={`creative-project-type-card ${iconTone}`}><span className="creative-project-type-icon"><Icon className="h-4 w-4" /></span><strong>{label}</strong><small>{description}</small></button>)}<button type="button" disabled={creating || !workspaceId} onClick={() => { setSelectedType("design"); void submitProject("design"); }} className="creative-project-type-card creative-project-type-ai"><span className="creative-project-type-icon"><Bot className="h-4 w-4" /></span><strong>AI Studio</strong><small>Generate, edit and enhance with AI.</small></button></div>{error && <p className="mt-3 text-[9px] text-rose-300">{error}</p>}<div className="mt-4 flex justify-end"><button type="button" onClick={() => setNewProjectOpen(false)} className="creative-modal-cancel">Cancel</button></div></section></div>}
    </main>
  );
}
