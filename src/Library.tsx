"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { FileText, Pencil, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import type { LibraryAsset, LibraryHost } from "./host";
import CyberLoading from "../../../src/components/Home/loading";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);

export default function LibraryPlugin({ host }: { host: LibraryHost }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<LibraryAsset | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const loadAssets = async () => {
    try {
      setAssets(await host.listAssets());
    } catch {
      host.notify("Unable to load the workspace library.", "error");
    }
  };

  useEffect(() => {
    void loadAssets();
  }, [host]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    setUploading(true);
    setUploadProgress({ completed: 0, total: selected.length });
    try {
      for (const [index, file] of selected.entries()) {
        if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
          throw new Error(`${file.name} is not an image or PDF.`);
        }
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`${file.name} is larger than 25 MB.`);
        }

        const response = await fetch(await host.generateUploadUrl(), {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error(`Upload failed for ${file.name}.`);

        const result = (await response.json()) as { storageId: string };
        await host.createAsset({
          storageId: result.storageId,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
        });
        setUploadProgress({ completed: index + 1, total: selected.length });
      }

      await loadAssets();
      host.notify(`${selected.length} file${selected.length === 1 ? "" : "s"} added to the library.`);
    } catch (error) {
      host.notify(
        error instanceof Error ? error.message : "Unable to upload the selected files.",
        "error",
      );
    } finally {
      setUploading(false);
      setUploadProgress({ completed: 0, total: 0 });
    }
  };

  const beginRename = (asset: LibraryAsset) => {
    setEditingId(asset.id);
    setEditingName(asset.name);
  };

  const finishRename = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;

    try {
      await host.renameAsset(editingId, name);
      await loadAssets();
      host.notify("File name updated.");
    } catch (error) {
      host.notify(error instanceof Error ? error.message : "Unable to rename the file.", "error");
    }
  };

  const handleRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void finishRename();
    if (event.key === "Escape") setEditingId(null);
  };

  const remove = async (asset: LibraryAsset) => {
    try {
      await host.deleteAsset(asset.id);
      await loadAssets();
      host.notify("File deleted from the library.");
    } catch (error) {
      host.notify(error instanceof Error ? error.message : "Unable to delete the file.", "error");
    }
    setDeleteTarget(null);
  };

  const removeSelected = async () => {
    if (selectedAssetIds.length === 0) return;
    try {
      await host.deleteAssets(selectedAssetIds);
      await loadAssets();
      host.notify(`${selectedAssetIds.length} file${selectedAssetIds.length === 1 ? "" : "s"} deleted from the library.`);
      setSelectedAssetIds([]);
    } catch (error) {
      host.notify(error instanceof Error ? error.message : "Unable to delete the selected files.", "error");
    }
    setBulkDeleteOpen(false);
  };

  const visibleAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const totalSize = assets.reduce((total, asset) => total + asset.size, 0);

  return (
    <section className="h-full overflow-hidden bg-[#030711] px-5 py-5 text-slate-100 sm:px-8 lg:px-9">
      <CyberLoading
        visible={uploading}
        message={`Uploading files ${Math.min(uploadProgress.completed + 1, uploadProgress.total)} of ${uploadProgress.total}`}
        progress={uploadProgress.total ? (uploadProgress.completed / uploadProgress.total) * 100 : 0}
      />
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="relative shrink-0 overflow-hidden px-4 py-1 sm:px-6">
          <div className="relative flex flex-wrap items-center gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.24em] text-cyan-300/70">
              <Sparkles className="h-3 w-3" /> Asset nexus / library
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {selectedAssetIds.length > 0 && (
                <button type="button" onClick={() => setBulkDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition hover:bg-red-400/30" style={{ border: "1px solid rgba(248, 113, 113, 0.55)", backgroundColor: "rgba(248, 113, 113, 0.2)", color: "#fee2e2" }}>
                  <Trash2 className="h-3 w-3" /> Delete all selected ({selectedAssetIds.length})
                </button>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-300/50 bg-cyan-300/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100">
                <Upload className="h-3 w-3" />
                {uploading ? "Uploading..." : "Upload file"}
                <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple onChange={upload} className="sr-only" disabled={uploading} />
              </label>
              <label className="flex h-8 w-40 items-center gap-1.5 rounded-md border border-indigo-300/15 bg-[#07111f] px-2.5 text-slate-500">
                <Search className="h-3.5 w-3.5" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the vault" className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600" />
              </label>
            </div>
          </div>
        </div>
        <div className="mt-1 ml-3 flex gap-6">
          <Stat label="Total assets" value={assets.length} />
          <Stat label="Storage" value={formatSize(totalSize)} />
        </div>

        {visibleAssets.length > 0 ? (
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
            <div style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }} className="grid gap-x-1 gap-y-2 pb-4">
              {visibleAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  editingId={editingId}
                  editingName={editingName}
                  setEditingName={setEditingName}
                  beginRename={beginRename}
                  finishRename={finishRename}
                  handleRenameKey={handleRenameKey}
                  selected={selectedAssetIds.includes(asset.id)}
                  onToggleSelect={(assetId) => setSelectedAssetIds((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId])}
                  onDelete={() => setDeleteTarget(asset)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="max-w-sm text-xs leading-5 text-slate-500">Upload campaign imagery or PDF dossiers to make them available across this workspace.</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cyan-300/35 px-3 py-2 text-xs text-cyan-100">
              <Upload className="h-3.5 w-3.5" /> Upload first asset
            </button>
          </div>
        )}
      </div>
      {deleteTarget && (
        <DeleteDialog
          title="Delete this asset?"
          description={`${deleteTarget.name} will be permanently removed from the workspace library.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void remove(deleteTarget)}
        />
      )}
      {bulkDeleteOpen && (
        <DeleteDialog
          title="Delete selected files?"
          description={`${selectedAssetIds.length} selected file${selectedAssetIds.length === 1 ? "" : "s"} will be permanently removed from the workspace library.`}
          onCancel={() => setBulkDeleteOpen(false)}
          onConfirm={() => void removeSelected()}
        />
      )}
    </section>
  );
}

function DeleteDialog({
  title,
  description,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center px-5 backdrop-blur-sm" style={{ backgroundColor: "rgba(1, 4, 11, 0.82)" }} role="dialog" aria-modal="true" aria-labelledby="delete-library-title">
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: "#081322", border: "1px solid rgba(248, 113, 113, 0.35)", boxShadow: "0 0 50px rgba(248, 113, 113, 0.2)", color: "#f8fafc" }}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ border: "1px solid rgba(248, 113, 113, 0.35)", backgroundColor: "rgba(248, 113, 113, 0.14)", color: "#fecaca" }}>
            <Trash2 className="h-5 w-5" />
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel delete" className="text-slate-400 transition hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 id="delete-library-title" className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 wrap-break-word text-sm leading-6 text-slate-300">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-xs text-slate-200 transition hover:bg-white/10" style={{ border: "1px solid rgba(148, 163, 184, 0.3)", backgroundColor: "rgba(148, 163, 184, 0.08)" }}>Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded-lg px-4 py-2 text-xs font-semibold text-red-50 transition hover:bg-red-400/30" style={{ border: "1px solid rgba(248, 113, 113, 0.55)", backgroundColor: "rgba(248, 113, 113, 0.2)" }}>Delete permanently</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-[8px] uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-0.5 text-base font-semibold text-cyan-100">{value}</p></div>;
}

type AssetCardProps = {
  asset: LibraryAsset;
  editingId: string | null;
  editingName: string;
  setEditingName: (value: string) => void;
  beginRename: (asset: LibraryAsset) => void;
  finishRename: () => Promise<void>;
  handleRenameKey: (event: KeyboardEvent<HTMLInputElement>) => void;
  selected: boolean;
  onToggleSelect: (assetId: string) => void;
  onDelete: () => void;
};

function AssetCard({ asset, editingId, editingName, setEditingName, beginRename, finishRename, handleRenameKey, selected, onToggleSelect, onDelete }: AssetCardProps) {
  return (
    <article style={{ width: "90%", justifySelf: "start" }} className={`group overflow-hidden rounded-xl border bg-[#07111f]/90 transition hover:-translate-y-1 hover:border-cyan-300/35 hover:shadow-[0_12px_30px_rgba(34,211,238,0.08)] ${selected ? "border-red-300/60 ring-1 ring-red-300/30" : "border-indigo-300/15"}`}>
      <div className="relative flex h-25 items-center justify-center overflow-hidden border-b border-indigo-300/10 bg-[#0a1728]">
        {asset.mimeType === "image" && asset.url ? <img src={asset.url} alt={asset.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex flex-col items-center gap-2 text-amber-200"><FileText className="h-10 w-10 stroke-1" /><span className="text-[9px] uppercase tracking-[0.2em]">PDF dossier</span></div>}
        <span className="absolute left-2 top-2 rounded-md border border-white/10 bg-[#030711]/75 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.16em] text-slate-300">{asset.mimeType}</span>
        {asset.canDelete && <label className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/15 bg-[#030711]/80"><input type="checkbox" checked={selected} onChange={() => onToggleSelect(asset.id)} className="h-3.5 w-3.5 accent-red-400" aria-label={`Select ${asset.name}`} /></label>}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            {editingId === asset.id ? <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onBlur={() => void finishRename()} onKeyDown={handleRenameKey} className="w-full border-b border-cyan-300/60 bg-transparent pb-1 text-xs font-medium text-white outline-none" /> : <p className="truncate text-xs font-medium text-slate-100">{asset.name}</p>}
            <p className="mt-1 text-[9px] uppercase tracking-widest text-slate-500">{formatSize(asset.size)} · {formatDate(asset.createdAt)}</p>
          </div>
          {asset.canDelete && <button type="button" onClick={onDelete} aria-label={`Delete ${asset.name}`} className="rounded-lg p-1 transition hover:bg-red-400/30" style={{ border: "1px solid rgba(248, 113, 113, 0.45)", backgroundColor: "rgba(248, 113, 113, 0.16)", color: "#fecaca" }}><Trash2 className="h-3 w-3" /></button>}
          <button type="button" onClick={() => beginRename(asset)} aria-label={`Rename ${asset.name}`} className="rounded-md p-1 text-slate-600 transition hover:bg-cyan-300/10 hover:text-cyan-200"><Pencil className="h-3 w-3" /></button>
        </div>
      </div>
    </article>
  );
}
