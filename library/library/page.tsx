
"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileText, Pencil, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useMoonToast } from "../../../components/MoonToastProvider";
import CyberLoading from "../../../components/Home/loading";

type LibraryProps = { username?: string | null; workspaceId?: Id<"workspaces"> };
type LibraryFile = {
  _id: Id<"libraryFiles">;
  name: string;
  mimeType: "image" | "pdf";
  size: number;
  createdAt: number;
  url: string | null;
  canDelete?: boolean;
};

const formatSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(timestamp);

export default function Library({ username, workspaceId }: LibraryProps) {
  const { notify } = useMoonToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"libraryFiles"> | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<LibraryFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const files = useQuery(api.files.listForWorkspace, username && workspaceId ? { username, workspaceId } : "skip") as LibraryFile[] | undefined;
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createFile = useMutation(api.files.create);
  const renameFile = useMutation(api.files.rename);
  const removeFile = useMutation(api.files.remove);
  const removeFiles = useMutation(api.files.removeMany);
  const [selectedFileIds, setSelectedFileIds] = useState<Id<"libraryFiles">[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const visibleFiles = (files ?? []).filter((file) => file.name.toLowerCase().includes(search.trim().toLowerCase()));
  const canDeleteFiles = files?.some((file) => file.canDelete) ?? false;

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!username || !workspaceId || selected.length === 0) return;
    setUploading(true);
    setUploadProgress({ completed: 0, total: selected.length });
    try {
      for (const [index, file] of selected.entries()) {
        if (!(file.type.startsWith("image/") || file.type === "application/pdf")) throw new Error(`${file.name} is not an image or PDF.`);
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error(`Upload failed for ${file.name}.`);
        const { storageId } = await response.json() as { storageId: Id<"_storage"> };
        await createFile({ username, workspaceId, storageId, originalName: file.name, mimeType: file.type, size: file.size });
        setUploadProgress({ completed: index + 1, total: selected.length });
      }
      notify(`${selected.length} file${selected.length === 1 ? "" : "s"} added to the library.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to upload the selected files.", "error");
    } finally {
      setUploading(false);
      setUploadProgress({ completed: 0, total: 0 });
    }
  };

  const beginRename = (file: LibraryFile) => {
    setEditingId(file._id);
    setEditingName(file.name);
  };
  const finishRename = async () => {
    if (!editingId || !username) return;
    const name = editingName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    try {
      await renameFile({ username, fileId: editingId, name });
      notify("File name updated.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to rename the file.", "error");
    }
    setEditingId(null);
  };
  const handleRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void finishRename();
    if (event.key === "Escape") setEditingId(null);
  };
  const confirmDelete = async () => {
    if (!deleteTarget || !username) return;
    try {
      await removeFile({ username, fileId: deleteTarget._id });
      notify("File deleted from the library.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete the file.", "error");
    }
    setDeleteTarget(null);
  };
  const confirmBulkDelete = async () => {
    if (!username || selectedFileIds.length === 0) return;
    try {
      await removeFiles({ username, fileIds: selectedFileIds });
      notify(`${selectedFileIds.length} file${selectedFileIds.length === 1 ? "" : "s"} deleted from the library.`);
      setSelectedFileIds([]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete the selected files.", "error");
    }
    setBulkDeleteOpen(false);
  };

  return (
    <section className="h-full overflow-hidden bg-[#030711] px-5 py-5 text-slate-100 sm:px-8 lg:px-9">
      <CyberLoading visible={uploading} message={`Uploading files ${Math.min(uploadProgress.completed + 1, uploadProgress.total)} of ${uploadProgress.total}`} progress={uploadProgress.total ? (uploadProgress.completed / uploadProgress.total) * 100 : 0} />
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="relative shrink-0 overflow-hidden px-4 py-1 sm:px-6">
          <div className="relative flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.24em] text-cyan-300/70"><Sparkles className="h-3 w-3" /> Asset nexus / library</div>
              
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
              {canDeleteFiles && selectedFileIds.length > 0 && <button type="button" onClick={() => setBulkDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-red-300/40 bg-red-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-100 transition hover:bg-red-400/20"><Trash2 className="h-3 w-3" /> Delete selected ({selectedFileIds.length})</button>}
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-300/50 bg-cyan-300/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-300/20 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                <Upload className="h-3 w-3" /> {uploading ? "Uploading..." : "Upload file"}
              <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={upload} disabled={uploading} />
              </label>
              <label className="flex h-8 w-40 items-center gap-1.5 rounded-md border border-indigo-300/15 bg-[#07111f] px-2.5 text-slate-500">
                <Search className="h-3.5 w-3.5" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the vault" className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600" />
              </label>
            </div>
          </div>
          <div className="relative mt-1 grid grid-cols-[auto_auto] justify-start gap-6 border-t border-cyan-300/10 pt-1.5">
            <Stat label="Total assets" value={files?.length ?? 0} tone="text-cyan-100" />
            <Stat label="Storage" value={formatSize((files ?? []).reduce((total, file) => total + file.size, 0))} tone="text-emerald-100" />
          </div>
        </div>

        {visibleFiles.length > 0 ? (
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="grid grid-cols-2 gap-2 pb-5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5 xl:grid-cols-7">
              {visibleFiles.map((file) => <FileCard key={file._id} file={file} selected={selectedFileIds.includes(file._id)} onToggleSelect={(fileId) => setSelectedFileIds((current) => current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId])} editingId={editingId} editingName={editingName} setEditingName={setEditingName} beginRename={beginRename} finishRename={finishRename} handleRenameKey={handleRenameKey} setDeleteTarget={setDeleteTarget} />)}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center"><p className="max-w-sm text-xs leading-5 text-slate-500">Upload campaign imagery or PDF dossiers to make them available across this workspace.</p><button type="button" onClick={() => inputRef.current?.click()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cyan-300/35 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10"><Upload className="h-3.5 w-3.5" /> Upload first asset</button></div>
        )}
      </div>
      {deleteTarget && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#01040b]/80 px-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-library-file"><div className="w-full max-w-sm rounded-2xl border border-red-300/25 bg-[#081322] p-6 shadow-[0_0_50px_rgba(248,113,113,0.12)]"><div className="mb-4 flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-300/25 bg-red-300/10 text-red-200"><Trash2 className="h-5 w-5" /></div><button type="button" onClick={() => setDeleteTarget(null)} aria-label="Cancel delete" className="text-slate-500 hover:text-white"><X className="h-5 w-5" /></button></div><h2 id="delete-library-file" className="text-lg font-semibold text-white">Delete this asset?</h2><p className="mt-2 break-words text-sm leading-6 text-slate-400"><span className="text-slate-200">{deleteTarget.name}</span> will be permanently removed from the workspace library.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-300/15 px-4 py-2 text-xs text-slate-300 hover:bg-white/5">Keep file</button><button type="button" onClick={() => void confirmDelete()} className="rounded-lg border border-red-300/40 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-100 hover:bg-red-400/20">Delete permanently</button></div></div></div>}
      {bulkDeleteOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#01040b]/80 px-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-library-files"><div className="w-full max-w-sm rounded-2xl border border-red-300/25 bg-[#081322] p-6 shadow-[0_0_50px_rgba(248,113,113,0.12)]"><div className="mb-4 flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-300/25 bg-red-300/10 text-red-200"><Trash2 className="h-5 w-5" /></div><button type="button" onClick={() => setBulkDeleteOpen(false)} aria-label="Cancel bulk delete" className="text-slate-500 hover:text-white"><X className="h-5 w-5" /></button></div><h2 id="delete-library-files" className="text-lg font-semibold text-white">Delete selected files?</h2><p className="mt-2 text-sm leading-6 text-slate-400">{selectedFileIds.length} selected file{selectedFileIds.length === 1 ? "" : "s"} will be permanently removed from the workspace library.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setBulkDeleteOpen(false)} className="rounded-lg border border-slate-300/15 px-4 py-2 text-xs text-slate-300 hover:bg-white/5">Keep files</button><button type="button" onClick={() => void confirmBulkDelete()} className="rounded-lg border border-red-300/40 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-100 hover:bg-red-400/20">Delete permanently</button></div></div></div>}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return <div><p className="text-[8px] uppercase tracking-[0.16em] text-slate-500">{label}</p><p className={`mt-0.5 text-base font-semibold ${tone}`}>{value}</p></div>;
}

type FileCardProps = { file: LibraryFile; selected: boolean; onToggleSelect: (fileId: Id<"libraryFiles">) => void; editingId: Id<"libraryFiles"> | null; editingName: string; setEditingName: (value: string) => void; beginRename: (file: LibraryFile) => void; finishRename: () => Promise<void>; handleRenameKey: (event: KeyboardEvent<HTMLInputElement>) => void; setDeleteTarget: (file: LibraryFile) => void };
function FileCard({ file, selected, onToggleSelect, editingId, editingName, setEditingName, beginRename, finishRename, handleRenameKey, setDeleteTarget }: FileCardProps) {
  return <article className={`group overflow-hidden rounded-xl border bg-[#07111f]/90 transition hover:-translate-y-1 hover:border-cyan-300/35 hover:shadow-[0_12px_30px_rgba(34,211,238,0.08)] ${selected ? "border-red-300/60 ring-1 ring-red-300/30" : "border-indigo-300/15"}`}><div className="relative flex aspect-[1.6] items-center justify-center overflow-hidden border-b border-indigo-300/10 bg-[#0a1728]">{file.mimeType === "image" && file.url ? <img src={file.url} alt={file.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex flex-col items-center gap-2 text-amber-200"><FileText className="h-10 w-10 stroke-1" /><span className="text-[9px] uppercase tracking-[0.2em]">PDF dossier</span></div>}<span className="absolute left-2 top-2 rounded-md border border-white/10 bg-[#030711]/75 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.16em] text-slate-300">{file.mimeType}</span>{file.canDelete && <label className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/15 bg-[#030711]/80"><input type="checkbox" checked={selected} onChange={() => onToggleSelect(file._id)} className="h-3.5 w-3.5 accent-red-400" aria-label={`Select ${file.name}`} /></label>}</div><div className="p-3"><div className="flex items-start justify-between gap-1"><div className="min-w-0 flex-1" onDoubleClick={() => beginRename(file)}>{editingId === file._id ? <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onBlur={() => void finishRename()} onKeyDown={handleRenameKey} className="w-full border-b border-cyan-300/60 bg-transparent pb-1 text-xs font-medium text-white outline-none" /> : <button type="button" onDoubleClick={() => beginRename(file)} className="block max-w-full truncate text-left text-xs font-medium text-slate-100" title="Double-click to rename">{file.name}</button>}<p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-slate-500">{formatSize(file.size)} · {formatDate(file.createdAt)}</p></div>{file.canDelete && <button type="button" onClick={() => setDeleteTarget(file)} aria-label={`Delete ${file.name}`} className="rounded-lg p-1 text-red-200 opacity-0 transition hover:bg-red-400/20 group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>}<button type="button" onClick={() => beginRename(file)} className="rounded-md p-1 text-slate-600 transition hover:bg-cyan-300/10 hover:text-cyan-200" aria-label={`Rename ${file.name}`}><Pencil className="h-3 w-3" /></button></div></div></article>;
}
