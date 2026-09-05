"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { LibraryAsset, LibraryHost } from "./host";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export default function LibraryPlugin({ host }: { host: LibraryHost }) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void host
      .listAssets()
      .then(setAssets)
      .catch(() => host.notify("Unable to load the workspace library.", "error"));
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
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`${file.name} is larger than 25 MB.`);
        }

        const uploadUrl = await host.generateUploadUrl();
        const response = await fetch(uploadUrl, {
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
      }

      setAssets(await host.listAssets());
      host.notify(`${files.length} file${files.length === 1 ? "" : "s"} added to the library.`);
    } catch (error) {
      host.notify(
        error instanceof Error ? error.message : "Unable to upload the selected files.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  };

  const visibleAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section style={{ padding: 16 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Library</h1>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the library"
          style={{ flex: 1, padding: "8px 10px" }}
        />

        <label style={{ cursor: "pointer", border: "1px solid #d1d5db", padding: "8px 10px", borderRadius: 8 }}>
          {uploading ? "Uploading..." : "Upload files"}
          <input type="file" accept="image/*,application/pdf" multiple onChange={upload} disabled={uploading} style={{ display: "none" }} />
        </label>
      </header>

      <div style={{ display: "grid", gap: 8 }}>
        {visibleAssets.length === 0 ? (
          <p>No files in the workspace library yet.</p>
        ) : (
          visibleAssets.map((asset) => (
            <article key={asset.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
              <strong>{asset.name}</strong>
              <div style={{ color: "#6b7280", fontSize: 12 }}>
                {asset.mimeType} · {asset.size} bytes
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
