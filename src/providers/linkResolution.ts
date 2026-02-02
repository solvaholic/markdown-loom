import * as vscode from 'vscode';

export async function resolveWikiLinkTarget(
  target: string,
  fromUri: vscode.Uri
): Promise<vscode.Uri | null> {
  const normalizedTarget = target.replace(/\.md$/i, '');
  const targetLower = normalizedTarget.toLowerCase();
  const files = await vscode.workspace.findFiles('**/*.md');
  const includeWorkspaceFolder =
    (vscode.workspace.workspaceFolders?.length ?? 0) > 1;

  const currentFolder = vscode.workspace.getWorkspaceFolder(fromUri);
  const currentPrefix = currentFolder ? `${currentFolder.name}/` : '';

  let bestMatch: vscode.Uri | null = null;
  let bestMatchScore = -1;

  for (const file of files) {
    const relativePath = getRelativePath(file, includeWorkspaceFolder);
    const pathWithoutExt = relativePath.replace(/\.md$/i, '');
    const pathLower = pathWithoutExt.toLowerCase();
    const basenameLower = pathLower.split('/').pop() ?? pathLower;

    let score = -1;
    if (pathLower === targetLower) {
      score = 3;
    } else if (basenameLower === targetLower) {
      score = 2;
    }

    if (score > bestMatchScore) {
      bestMatch = file;
      bestMatchScore = score;
    } else if (score === bestMatchScore && bestMatch) {
      const bestPath = getRelativePath(bestMatch, includeWorkspaceFolder)
        .replace(/\.md$/i, '')
        .toLowerCase();
      const currentScore = pathLower.startsWith(currentPrefix.toLowerCase())
        ? 1
        : 0;
      const bestScore = bestPath.startsWith(currentPrefix.toLowerCase()) ? 1 : 0;
      if (currentScore > bestScore) {
        bestMatch = file;
      }
    }
  }

  return bestMatch;
}

function getRelativePath(uri: vscode.Uri, includeWorkspaceFolder: boolean): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    return uri.fsPath;
  }
  return vscode.workspace.asRelativePath(uri, includeWorkspaceFolder);
}
