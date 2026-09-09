declare module "@moon/convex-api" {
  export const api: any;
}

declare module "@moon/convex-data-model" {
  export type Id<TableName extends string> = string & { readonly __tableName: TableName };
}