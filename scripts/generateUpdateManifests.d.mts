export interface UpdateArtifact {
  url: string
  sha512: string
  size: number
  blockMapSize?: number
}
export function serializeUpdateManifest(version: string, files: UpdateArtifact[], releaseDate: string): string
export function groupUpdateArtifacts(files: UpdateArtifact[]): Record<string, UpdateArtifact[]>
export function validateUpdateArtifacts(groups: Record<string, UpdateArtifact[]>): void
export function generateUpdateManifests(outputDirectory: string, rawTag: string): Promise<void>
