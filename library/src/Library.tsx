"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { LibraryAsset, LibraryHost } from "./host";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export default function LibraryPlugin({ host }: { host: LibraryHost }) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void host.listAssets().then(setAssets).catch(() => host.notify("Unable to load the workspace library.", "error"));
  }, [host]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
          throw new Error(`${file.name} is not an image or PDF.`);
        }
        if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 25 MB.`);
        const uploadUrl = await host.generateUploadUrl();
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error(`Upload failed for ${file.name}.`);
        const result = await response.json() as { storageId: string };
        await host.createAsset({ storageId: result.storageId, originalName: file.name, mimeType: file.type, size: file.size });
      }
      setAssets(await host.listAssets());
      host.notify(`${files.length} file${files.length === 1 ? "" : "s"} added to the library.`);
    } catch (error) {
      host.notify(error instanceof Error ? error.message : "Unable to upload the selected files.", "error");
    } finally {
      setUploading(false);
    }
  };

  const visibleAssets = assets.filter((asset) => asset.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <section>
      <header>
        <h1>Library</h1>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the library" />
        <label>
          {uploading ? "Uploading..." : "Upload files"}
          <input type="file" accept="image/*,application/pdf" multiple onChange={upload} disabled={uploading} />
        </label>
      </header>
      <div>
        {visibleAssets.map((asset) => <article key={asset.id}><strong>{asset.name}</strong><span>{asset.mimeType} · {asset.size} bytes</span></article>)}
      </div>
    </section>
  );
}
