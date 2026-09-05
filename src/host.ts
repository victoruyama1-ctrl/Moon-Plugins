export type LibraryAsset = {
  id: string;
  name: string;
  mimeType: "image" | "pdf";
  size: number;
  createdAt: number;
  url: string | null;
  canDelete: boolean;
};

export type LibraryHost = {
  username: string;
  workspaceId: string;
  listAssets: () => Promise<LibraryAsset[]>;
  generateUploadUrl: () => Promise<string>;
  createAsset: (input: {
    storageId: string;
    originalName: string;
    mimeType: string;
    size: number;
  }) => Promise<void>;
  renameAsset: (fileId: string, name: string) => Promise<void>;
  deleteAsset: (fileId: string) => Promise<void>;
  deleteAssets: (fileIds: string[]) => Promise<void>;
  notify: (message: string, tone?: "error") => void;
};
