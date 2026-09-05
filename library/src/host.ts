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
  createAsset: (input: {
    storageId: string;
    originalName: string;
    mimeType: string;
    size: number;
  }) => Promise<void>;
  generateUploadUrl: () => Promise<string>;
  renameAsset: (assetId: string, name: string) => Promise<void>;
  deleteAsset: (assetId: string) => Promise<void>;
  deleteAssets: (assetIds: string[]) => Promise<void>;
  notify: (message: string, tone?: "error") => void;
};
