import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getNewFileLocationConfig,
  resolveNewNoteDirectory,
  NewFileLocationConfig,
} from '../../providers/linkCommands';

function fixturePath(...parts: string[]): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri.fsPath ?? '';
  return path.join(path.dirname(root), ...parts);
}

function uriFor(...parts: string[]): vscode.Uri {
  return vscode.Uri.file(fixturePath(...parts));
}

function folderFor(name: string): vscode.WorkspaceFolder {
  const uri = uriFor(name);
  const found = (vscode.workspace.workspaceFolders ?? []).find(
    (f) => f.uri.fsPath === uri.fsPath
  );
  assert.ok(found, `expected workspace folder ${name} in test fixture`);
  return found!;
}

// Mirrors the inline logic that lived in linkCommands.ts before the
// helpers were exported. Tests assert the exported helper matches this
// byte-for-byte across every relevant input.
function resolveNewNoteDirectoryInline(
  workspaceFolder: vscode.WorkspaceFolder,
  fromUri: vscode.Uri,
  location: NewFileLocationConfig
): string {
  const root = workspaceFolder.uri.fsPath;
  if (location.mode === 'sameFolderAsActive') {
    if (fromUri.scheme === 'file' && fromUri.fsPath) {
      return path.dirname(fromUri.fsPath);
    }
    return root;
  }
  if (location.mode === 'customPath') {
    const trimmed = (location.customPath ?? '').trim();
    if (!trimmed) {
      return root;
    }
    const candidate = path.resolve(root, trimmed);
    const rel = path.relative(root, candidate);
    if (rel === '') {
      return root;
    }
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return root;
    }
    return candidate;
  }
  return root;
}

suite('resolveNewNoteDirectory parity with inline logic', () => {
  const rootA = folderFor('rootA');
  const rootB = folderFor('rootB');
  const noteInRootA = uriFor('rootA', 'folder', 'Sub.md');
  const noteInRootB = uriFor('rootB', 'Sibling.md');
  const untitled = uriFor('rootA', 'scratch.md').with({ scheme: 'untitled' });

  const cases: Array<{
    name: string;
    folder: vscode.WorkspaceFolder;
    from: vscode.Uri;
    location: NewFileLocationConfig;
  }> = [
    { name: 'workspaceRoot mode returns the folder root',
      folder: rootA, from: noteInRootA, location: { mode: 'workspaceRoot' } },
    { name: 'sameFolderAsActive returns dirname of file URI',
      folder: rootA, from: noteInRootA, location: { mode: 'sameFolderAsActive' } },
    { name: 'sameFolderAsActive falls back to root for non-file URI',
      folder: rootA, from: untitled, location: { mode: 'sameFolderAsActive' } },
    { name: 'customPath with empty string falls back to root',
      folder: rootA, from: noteInRootA, location: { mode: 'customPath', customPath: '' } },
    { name: 'customPath with whitespace falls back to root',
      folder: rootA, from: noteInRootA, location: { mode: 'customPath', customPath: '   ' } },
    { name: 'customPath undefined falls back to root',
      folder: rootA, from: noteInRootA, location: { mode: 'customPath' } },
    { name: 'customPath workspace-relative resolves under root',
      folder: rootA, from: noteInRootA, location: { mode: 'customPath', customPath: 'inbox' } },
    { name: 'customPath nested workspace-relative',
      folder: rootA, from: noteInRootA, location: { mode: 'customPath', customPath: 'inbox/nested' } },
    { name: 'customPath ".." escape falls back to root',
      folder: rootA, from: noteInRootA, location: { mode: 'customPath', customPath: '../escape' } },
    { name: 'customPath absolute path falls back to root',
      folder: rootA, from: noteInRootA, location: { mode: 'customPath', customPath: '/tmp/elsewhere' } },
    { name: 'customPath "." (same as root) falls back to root',
      folder: rootA, from: noteInRootA, location: { mode: 'customPath', customPath: '.' } },
    { name: 'multi-root: resolves against the source workspace folder (rootB)',
      folder: rootB, from: noteInRootB, location: { mode: 'customPath', customPath: 'inbox' } },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const fromHelper = resolveNewNoteDirectory(c.folder, c.from, c.location);
      const fromInline = resolveNewNoteDirectoryInline(c.folder, c.from, c.location);
      assert.strictEqual(fromHelper, fromInline);
    });
  }

  test('unknown mode is treated as workspaceRoot', () => {
    // Forced cast: simulates a future/unknown enum value reaching the helper.
    const bogus = { mode: 'somethingElse' } as unknown as NewFileLocationConfig;
    assert.strictEqual(
      resolveNewNoteDirectory(rootA, noteInRootA, bogus),
      rootA.uri.fsPath
    );
  });
});


suite('getNewFileLocationConfig', () => {
  // Stub vscode.workspace.getConfiguration so tests don't have to mutate
  // (and persist) the real workspace settings file. We only intercept the
  // 'markdownLoom' section; other sections pass through unchanged.
  const originalGetConfiguration = vscode.workspace.getConfiguration;

  function stubMarkdownLoomConfig(values: Record<string, unknown>): void {
    (vscode.workspace as unknown as { getConfiguration: unknown }).getConfiguration =
      ((section?: string, scope?: vscode.ConfigurationScope | null) => {
        if (section !== 'markdownLoom') {
          return originalGetConfiguration.call(
            vscode.workspace,
            section as string,
            scope ?? null
          );
        }
        const real = originalGetConfiguration.call(
          vscode.workspace,
          'markdownLoom',
          scope ?? null
        );
        return {
          ...real,
          get<T>(key: string, defaultValue?: T): T {
            if (Object.prototype.hasOwnProperty.call(values, key)) {
              const v = values[key];
              return (v === undefined ? defaultValue : v) as T;
            }
            return real.get(key, defaultValue as T);
          },
        } as vscode.WorkspaceConfiguration;
      }) as typeof vscode.workspace.getConfiguration;
  }

  teardown(() => {
    (vscode.workspace as unknown as { getConfiguration: unknown }).getConfiguration =
      originalGetConfiguration;
  });

  test('returns workspaceRoot defaults when nothing is configured', () => {
    stubMarkdownLoomConfig({});
    const result = getNewFileLocationConfig();
    assert.strictEqual(result.mode, 'workspaceRoot');
    assert.strictEqual(result.customPath, '');
  });

  test('reads sameFolderAsActive mode from configuration', () => {
    stubMarkdownLoomConfig({ newFileLocation: 'sameFolderAsActive' });
    assert.strictEqual(getNewFileLocationConfig().mode, 'sameFolderAsActive');
  });

  test('reads customPath mode plus path value from configuration', () => {
    stubMarkdownLoomConfig({
      newFileLocation: 'customPath',
      newFileCustomPath: 'inbox/nested',
    });
    const result = getNewFileLocationConfig();
    assert.strictEqual(result.mode, 'customPath');
    assert.strictEqual(result.customPath, 'inbox/nested');
  });

  test('unknown mode value falls back to workspaceRoot', () => {
    stubMarkdownLoomConfig({ newFileLocation: 'totallyBogus' });
    assert.strictEqual(getNewFileLocationConfig().mode, 'workspaceRoot');
  });

  test('null customPath is normalized to empty string', () => {
    stubMarkdownLoomConfig({ newFileCustomPath: null });
    assert.strictEqual(getNewFileLocationConfig().customPath, '');
  });
});
