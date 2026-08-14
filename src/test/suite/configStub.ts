import * as vscode from 'vscode';

const originalGetConfiguration = vscode.workspace.getConfiguration;

/**
 * Stub `vscode.workspace.getConfiguration` for the 'markdownLoom' section so
 * tests can vary settings without mutating real workspace configuration.
 *
 * Writing settings for real with `ConfigurationTarget.Workspace` persists them
 * into the committed multi-root fixture (`test-fixtures/*.code-workspace`),
 * which leaves a clean checkout dirty after `npm test` (see issue #125).
 *
 * Only the 'markdownLoom' section is intercepted; every other section passes
 * through to the real API. Keys absent from `values` also fall through, so a
 * test can override one setting and leave the rest at their real values.
 *
 * Always pair this with {@link restoreConfigStub} in a teardown.
 */
export function stubMarkdownLoomConfig(values: Record<string, unknown>): void {
  (vscode.workspace as unknown as { getConfiguration: unknown }).getConfiguration = ((
    section?: string,
    scope?: vscode.ConfigurationScope | null
  ) => {
    if (section !== 'markdownLoom') {
      return originalGetConfiguration.call(vscode.workspace, section as string, scope ?? null);
    }
    const real = originalGetConfiguration.call(vscode.workspace, 'markdownLoom', scope ?? null);
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

/** Restore the real `vscode.workspace.getConfiguration`. */
export function restoreConfigStub(): void {
  (vscode.workspace as unknown as { getConfiguration: unknown }).getConfiguration =
    originalGetConfiguration;
}
