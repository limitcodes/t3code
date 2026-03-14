import { useEffect, useMemo, useState } from "react";
import {
  CopyIcon,
  DownloadIcon,
  MonitorIcon,
  MoonIcon,
  SunMediumIcon,
  UploadIcon,
} from "lucide-react";

import { DEFAULT_TIMESTAMP_FORMAT, useAppSettings } from "../appSettings";
import {
  clampAppearanceContrast,
  clampUiFontSizePx,
  DEFAULT_DARK_APPEARANCE_THEME,
  DEFAULT_LIGHT_APPEARANCE_THEME,
  normalizeHexColor,
  parseImportedAppearanceTheme,
  serializeAppearanceTheme,
  type AppearanceMode,
} from "../lib/appearanceTheme";
import {
  CUSTOM_THEME_OPTIONS,
  CUSTOM_THEME_OPTIONS_BY_ID,
  isCustomThemeId,
  type CustomThemeId,
} from "../lib/customThemes";
import { useTheme, type Theme } from "../hooks/useTheme";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { toastManager } from "./ui/toast";

const THEME_MODE_OPTIONS: Array<{
  description: string;
  icon: typeof SunMediumIcon;
  label: string;
  value: Theme;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Use the light appearance.",
    icon: SunMediumIcon,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use the dark appearance.",
    icon: MoonIcon,
  },
  {
    value: "system",
    label: "System",
    description: "Match your system preference.",
    icon: MonitorIcon,
  },
] as const;

const TIMESTAMP_FORMAT_LABELS = {
  locale: "System default",
  "12-hour": "12-hour",
  "24-hour": "24-hour",
} as const;

function resolveEditedAppearance(theme: Theme, baseResolvedTheme: AppearanceMode): AppearanceMode {
  return theme === "system" ? baseResolvedTheme : theme;
}

function themeLabel(appearance: AppearanceMode): string {
  return appearance === "dark" ? "Dark theme" : "Light theme";
}

function themeDefaults(appearance: AppearanceMode) {
  return appearance === "dark" ? DEFAULT_DARK_APPEARANCE_THEME : DEFAULT_LIGHT_APPEARANCE_THEME;
}

function hexInputClassName() {
  return `h-8 w-11 cursor-pointer rounded-full border border-border bg-transparent p-1`;
}

export function AppearanceSettingsSection() {
  const { settings, defaults, updateSettings } = useAppSettings();
  const {
    theme,
    setTheme,
    resolvedTheme,
    baseResolvedTheme,
    customThemeId,
    customThemeEnabled,
    activeCustomTheme,
  } = useTheme();
  const editedAppearance = resolveEditedAppearance(theme, baseResolvedTheme);
  const activeThemeConfig =
    editedAppearance === "dark" ? settings.darkAppearanceTheme : settings.lightAppearanceTheme;
  const activeThemeDefaults = themeDefaults(editedAppearance);
  const selectedCustomTheme = CUSTOM_THEME_OPTIONS_BY_ID[customThemeId];
  const [colorDrafts, setColorDrafts] = useState(() => ({
    accent: activeThemeConfig.accent,
    background: activeThemeConfig.background,
    foreground: activeThemeConfig.foreground,
  }));
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const { copyToClipboard, isCopied } = useCopyToClipboard<void>({
    onCopy: () => {
      toastManager.add({
        type: "success",
        title: "Theme copied",
        description: `Copied ${themeLabel(editedAppearance).toLowerCase()} settings as JSON.`,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Copy failed",
        description: error.message,
      });
    },
  });

  useEffect(() => {
    setColorDrafts({
      accent: activeThemeConfig.accent,
      background: activeThemeConfig.background,
      foreground: activeThemeConfig.foreground,
    });
  }, [
    activeThemeConfig.accent,
    activeThemeConfig.background,
    activeThemeConfig.foreground,
    editedAppearance,
  ]);

  const appearanceSettingsKey =
    editedAppearance === "dark" ? "darkAppearanceTheme" : "lightAppearanceTheme";
  const presetColorsOverrideBase = customThemeEnabled;
  const previewRightLabel = presetColorsOverrideBase ? "Saved base theme" : "Current";

  const updateActiveThemeConfig = (patch: Partial<typeof activeThemeConfig>) => {
    updateSettings({
      [appearanceSettingsKey]: {
        ...activeThemeConfig,
        ...patch,
      },
    });
  };

  const previewSurfaceLabel = activeThemeConfig.translucentSidebar ? "sidebar-elevated" : "sidebar";
  const defaultSurfaceLabel = activeThemeDefaults.translucentSidebar
    ? "sidebar-elevated"
    : "sidebar";
  const previewLines = useMemo(
    () => [
      {
        key: "declaration",
        left: "const themePreview: ThemeConfig = {",
        right: "const themePreview: ThemeConfig = {",
      },
      {
        key: "surface",
        left: `  surface: "${defaultSurfaceLabel}",`,
        right: `  surface: "${previewSurfaceLabel}",`,
      },
      {
        key: "accent",
        left: `  accent: "${activeThemeDefaults.accent}",`,
        right: `  accent: "${activeThemeConfig.accent}",`,
      },
      {
        key: "contrast",
        left: `  contrast: ${activeThemeDefaults.contrast},`,
        right: `  contrast: ${activeThemeConfig.contrast},`,
      },
      { key: "closing", left: "};", right: "};" },
    ],
    [
      activeThemeConfig.accent,
      activeThemeConfig.contrast,
      activeThemeDefaults.accent,
      activeThemeDefaults.contrast,
      defaultSurfaceLabel,
      previewSurfaceLabel,
    ],
  );

  const applyImportedTheme = () => {
    try {
      const importedTheme = parseImportedAppearanceTheme(importText, editedAppearance);
      updateSettings({
        [appearanceSettingsKey]: importedTheme,
      });
      setImportDialogOpen(false);
      setImportText("");
      toastManager.add({
        type: "success",
        title: "Theme imported",
        description: `Applied imported values to the ${themeLabel(editedAppearance).toLowerCase()}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Import failed",
        description: error instanceof Error ? error.message : "Unable to import theme JSON.",
      });
    }
  };

  const handleColorCommit = (field: keyof typeof colorDrafts) => {
    const nextValue = normalizeHexColor(colorDrafts[field], activeThemeConfig[field]);
    if (nextValue !== colorDrafts[field].trim().toLowerCase()) {
      toastManager.add({
        type: "warning",
        title: "Invalid color",
        description: "Theme colors must be a 3-digit or 6-digit hex value.",
      });
    }

    setColorDrafts((existing) => ({
      ...existing,
      [field]: nextValue,
    }));
    updateActiveThemeConfig({ [field]: nextValue });
  };

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-medium text-foreground">Appearance</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Customize CUT3&apos;s base light and dark palettes, typography, and interactive chrome
            across web and Electron.
          </p>
        </div>

        <div className="space-y-5">
          <div
            className="inline-flex flex-wrap items-center gap-2 rounded-full border border-border bg-background/70 p-1"
            role="radiogroup"
            aria-label="Theme preference"
          >
            {THEME_MODE_OPTIONS.map((option) => {
              const selected = theme === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`app-interactive-motion inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                    selected
                      ? "bg-secondary text-foreground shadow-xs/5"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                  onClick={() => setTheme(option.value)}
                  title={option.description}
                >
                  <Icon className="size-4" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-background/70">
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-b border-border/70 bg-rose-500/6 md:border-r md:border-b-0">
                <div className="border-b border-border/70 px-4 py-3 text-xs font-medium text-muted-foreground">
                  Default
                </div>
                <ol className="space-y-0 px-4 py-3 font-mono text-sm leading-7 text-foreground">
                  {previewLines.map((line, index) => (
                    <li key={`left-${line.key}`} className="grid grid-cols-[1.5rem_1fr] gap-4">
                      <span className="text-right text-muted-foreground">{index + 1}</span>
                      <span>{line.left}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-emerald-500/8">
                <div className="border-b border-border/70 px-4 py-3 text-xs font-medium text-muted-foreground">
                  {previewRightLabel}
                </div>
                <ol className="space-y-0 px-4 py-3 font-mono text-sm leading-7 text-foreground">
                  {previewLines.map((line, index) => (
                    <li key={`right-${line.key}`} className="grid grid-cols-[1.5rem_1fr] gap-4">
                      <span className="text-right text-muted-foreground">{index + 1}</span>
                      <span>{line.right}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/65">
            <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {themeLabel(editedAppearance)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Edit the base palette and typography used when the app resolves to{" "}
                  <span className="font-medium text-foreground">{editedAppearance}</span>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs" variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <UploadIcon className="size-3.5" />
                  Import
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    copyToClipboard(serializeAppearanceTheme(activeThemeConfig), undefined)
                  }
                >
                  <CopyIcon className="size-3.5" />
                  {isCopied ? "Copied" : "Copy theme"}
                </Button>
                <Select
                  items={CUSTOM_THEME_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.id,
                  }))}
                  value={customThemeId}
                  onValueChange={(value) => {
                    if (!value || !isCustomThemeId(value)) return;
                    updateSettings({
                      customThemeId: value as CustomThemeId,
                      enableCatppuccinTheme: value === "catppuccin-auto",
                    });
                  }}
                >
                  <SelectTrigger className="min-w-56" aria-label="Theme preset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {CUSTOM_THEME_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm text-foreground">{option.label}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {customThemeId !== "none" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        customThemeId: "none",
                        enableCatppuccinTheme: false,
                      })
                    }
                  >
                    Remove custom theme
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="divide-y divide-border/70">
              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">Accent</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`${themeLabel(editedAppearance)} accent color`}
                    className={hexInputClassName()}
                    disabled={presetColorsOverrideBase}
                    type="color"
                    value={activeThemeConfig.accent}
                    onChange={(event) => {
                      const value = event.target.value.toLowerCase();
                      setColorDrafts((existing) => ({ ...existing, accent: value }));
                      updateActiveThemeConfig({ accent: value });
                    }}
                  />
                  <Input
                    className="h-9 w-32 text-right font-mono"
                    disabled={presetColorsOverrideBase}
                    value={colorDrafts.accent}
                    onBlur={() => handleColorCommit("accent")}
                    onChange={(event) =>
                      setColorDrafts((existing) => ({
                        ...existing,
                        accent: event.target.value,
                      }))
                    }
                    spellCheck={false}
                  />
                </div>
              </label>

              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">Background</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`${themeLabel(editedAppearance)} background color`}
                    className={hexInputClassName()}
                    disabled={presetColorsOverrideBase}
                    type="color"
                    value={activeThemeConfig.background}
                    onChange={(event) => {
                      const value = event.target.value.toLowerCase();
                      setColorDrafts((existing) => ({ ...existing, background: value }));
                      updateActiveThemeConfig({ background: value });
                    }}
                  />
                  <Input
                    className="h-9 w-32 text-right font-mono"
                    disabled={presetColorsOverrideBase}
                    value={colorDrafts.background}
                    onBlur={() => handleColorCommit("background")}
                    onChange={(event) =>
                      setColorDrafts((existing) => ({
                        ...existing,
                        background: event.target.value,
                      }))
                    }
                    spellCheck={false}
                  />
                </div>
              </label>

              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">Foreground</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`${themeLabel(editedAppearance)} foreground color`}
                    className={hexInputClassName()}
                    disabled={presetColorsOverrideBase}
                    type="color"
                    value={activeThemeConfig.foreground}
                    onChange={(event) => {
                      const value = event.target.value.toLowerCase();
                      setColorDrafts((existing) => ({ ...existing, foreground: value }));
                      updateActiveThemeConfig({ foreground: value });
                    }}
                  />
                  <Input
                    className="h-9 w-32 text-right font-mono"
                    disabled={presetColorsOverrideBase}
                    value={colorDrafts.foreground}
                    onBlur={() => handleColorCommit("foreground")}
                    onChange={(event) =>
                      setColorDrafts((existing) => ({
                        ...existing,
                        foreground: event.target.value,
                      }))
                    }
                    spellCheck={false}
                  />
                </div>
              </label>

              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">UI font</span>
                <Input
                  className="h-9 w-78 max-w-[65%] text-right"
                  value={activeThemeConfig.uiFont}
                  onChange={(event) => updateActiveThemeConfig({ uiFont: event.target.value })}
                  spellCheck={false}
                />
              </label>

              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">Code font</span>
                <Input
                  className="h-9 w-78 max-w-[65%] text-right"
                  value={activeThemeConfig.codeFont}
                  onChange={(event) => updateActiveThemeConfig({ codeFont: event.target.value })}
                  spellCheck={false}
                />
              </label>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Translucent sidebar</p>
                  <p className="text-xs text-muted-foreground">
                    Add backdrop blur and transparency to the main project sidebar.
                  </p>
                </div>
                <Switch
                  checked={activeThemeConfig.translucentSidebar}
                  onCheckedChange={(checked) =>
                    updateActiveThemeConfig({ translucentSidebar: Boolean(checked) })
                  }
                  aria-label="Translucent sidebar"
                />
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Contrast</p>
                    <p className="text-xs text-muted-foreground">
                      Increase separation between surfaces, borders, and interactive states.
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {activeThemeConfig.contrast}
                  </span>
                </div>
                <input
                  className="mt-3 w-full accent-primary"
                  disabled={presetColorsOverrideBase}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={activeThemeConfig.contrast}
                  onChange={(event) =>
                    updateActiveThemeConfig({
                      contrast: clampAppearanceContrast(Number(event.target.value)),
                    })
                  }
                />
              </div>
            </div>

            <div className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
              <p>
                Selected preset:{" "}
                <span className="font-medium text-foreground">{selectedCustomTheme.label}</span>
              </p>
              <p className="mt-1">
                Effective appearance:{" "}
                <span className="font-medium text-foreground">{resolvedTheme}</span>
              </p>
              <p className="mt-1">
                Base appearance setting:{" "}
                <span className="font-medium text-foreground">{baseResolvedTheme}</span>
              </p>
              {customThemeEnabled ? (
                <p className="mt-1">
                  Active preset:{" "}
                  <span className="font-medium text-foreground">
                    {activeCustomTheme?.label ?? "Custom preset"}
                  </span>
                  . Accent, background, foreground, and contrast now describe the saved base{" "}
                  {themeLabel(editedAppearance).toLowerCase()}, not the live preset colors. Remove
                  the preset to make those color changes live.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/65">
            <div className="divide-y divide-border/70">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Use pointer cursors</p>
                  <p className="text-xs text-muted-foreground">
                    Use hand cursors on buttons and links instead of the default arrow.
                  </p>
                </div>
                <Switch
                  checked={settings.usePointerCursors}
                  onCheckedChange={(checked) =>
                    updateSettings({ usePointerCursors: Boolean(checked) })
                  }
                  aria-label="Use pointer cursors"
                />
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">UI font size</p>
                  <p className="text-xs text-muted-foreground">
                    Adjust the base size used across the shared CUT3 interface.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9 w-20 text-right"
                    inputMode="numeric"
                    value={String(settings.uiFontSizePx)}
                    onChange={(event) =>
                      updateSettings({
                        uiFontSizePx: clampUiFontSizePx(Number(event.target.value || 0)),
                      })
                    }
                  />
                  <span className="text-sm text-muted-foreground">px</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Timestamp format</p>
                  <p className="text-xs text-muted-foreground">
                    System default follows your browser or OS time format.
                  </p>
                </div>
                <Select
                  value={settings.timestampFormat}
                  onValueChange={(value) => {
                    if (value !== "locale" && value !== "12-hour" && value !== "24-hour") return;
                    updateSettings({ timestampFormat: value });
                  }}
                >
                  <SelectTrigger className="w-40" aria-label="Timestamp format">
                    <SelectValue>{TIMESTAMP_FORMAT_LABELS[settings.timestampFormat]}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end">
                    <SelectItem value="locale">{TIMESTAMP_FORMAT_LABELS.locale}</SelectItem>
                    <SelectItem value="12-hour">{TIMESTAMP_FORMAT_LABELS["12-hour"]}</SelectItem>
                    <SelectItem value="24-hour">{TIMESTAMP_FORMAT_LABELS["24-hour"]}</SelectItem>
                  </SelectPopup>
                </Select>
              </div>
            </div>
          </div>

          {(activeThemeConfig.accent !== activeThemeDefaults.accent ||
            activeThemeConfig.background !== activeThemeDefaults.background ||
            activeThemeConfig.foreground !== activeThemeDefaults.foreground ||
            activeThemeConfig.uiFont !== activeThemeDefaults.uiFont ||
            activeThemeConfig.codeFont !== activeThemeDefaults.codeFont ||
            activeThemeConfig.translucentSidebar !== activeThemeDefaults.translucentSidebar ||
            activeThemeConfig.contrast !== activeThemeDefaults.contrast ||
            settings.usePointerCursors !== defaults.usePointerCursors ||
            settings.uiFontSizePx !== defaults.uiFontSizePx ||
            settings.timestampFormat !== DEFAULT_TIMESTAMP_FORMAT) && (
            <div className="flex justify-end">
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  updateSettings({
                    [appearanceSettingsKey]: activeThemeDefaults,
                    timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
                    uiFontSizePx: defaults.uiFontSizePx,
                    usePointerCursors: defaults.usePointerCursors,
                  })
                }
              >
                Restore defaults
              </Button>
            </div>
          )}
        </div>
      </section>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Import {themeLabel(editedAppearance).toLowerCase()}</DialogTitle>
            <DialogDescription>
              Paste a JSON object with <code>accent</code>, <code>background</code>,{" "}
              <code>foreground</code>, <code>uiFont</code>, <code>codeFont</code>,{" "}
              <code>translucentSidebar</code>, and <code>contrast</code>.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <Textarea
              className="min-h-48 font-mono text-xs"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={serializeAppearanceTheme(activeThemeConfig)}
              spellCheck={false}
            />
            <div className="rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              CUT3 only imports the current {themeLabel(editedAppearance).toLowerCase()} values.
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyImportedTheme}>
              <DownloadIcon className="size-4" />
              Apply import
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
