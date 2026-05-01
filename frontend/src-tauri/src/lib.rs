use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, State, WebviewWindow, Window, WindowEvent,
};
use tauri_plugin_dialog::{
    DialogExt, FileDialogBuilder, FilePath, MessageDialogButtons, MessageDialogKind,
    MessageDialogResult,
};

const APP_NAME: &str = "TypeFree";
const MAIN_WINDOW_LABEL: &str = "main";
const RECENT_DOCUMENTS_FILE: &str = "recent-documents.json";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum AppLocale {
    En,
    Zh,
    Ja,
}

#[derive(Clone)]
struct EditorUiState {
    locale: AppLocale,
    theme_mode: String,
    enter_mode: String,
    block_transition: String,
    view_mode: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentStatePayload {
    dirty: bool,
    file_path: Option<String>,
    file_name: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorUiStatePayload {
    block_transition: String,
    enter_mode: String,
    locale: AppLocale,
    theme_mode: String,
    view_mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveFilePayload {
    content: String,
    default_path: Option<String>,
    file_path: Option<String>,
    save_as: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameFilePayload {
    file_path: String,
    next_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfirmClosePayload {
    file_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenFileResult {
    canceled: bool,
    content: Option<String>,
    file_path: Option<String>,
    name: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenDocumentPayload {
    content: String,
    file_path: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveFileResult {
    canceled: bool,
    file_path: Option<String>,
    name: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedDocument {
    file_path: String,
    name: String,
}

#[derive(Clone, Serialize)]
struct MenuActionEvent {
    action: String,
    payload: Option<Value>,
}

struct AppState {
    documents: HashMap<String, DocumentStatePayload>,
    ui: EditorUiState,
    recent_documents: Vec<String>,
}

impl AppState {
    fn new() -> Self {
        Self {
            documents: HashMap::new(),
            ui: EditorUiState {
                locale: detect_system_locale(),
                theme_mode: "system".to_string(),
                enter_mode: "paragraph".to_string(),
                block_transition: "smooth".to_string(),
                view_mode: "wysiwyg".to_string(),
            },
            recent_documents: Vec::new(),
        }
    }
}

fn normalize_locale(value: &str) -> AppLocale {
    let normalized = value.trim().to_lowercase();
    if normalized == "zh" || normalized.starts_with("zh-") || normalized.starts_with("zh_") {
        return AppLocale::Zh;
    }
    if normalized == "ja" || normalized.starts_with("ja-") || normalized.starts_with("ja_") {
        return AppLocale::Ja;
    }
    if normalized == "en" || normalized.starts_with("en-") || normalized.starts_with("en_") {
        return AppLocale::En;
    }
    AppLocale::Zh
}

fn detect_system_locale() -> AppLocale {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("defaults")
            .args(["read", "-g", "AppleLanguages"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for token in stdout
                    .split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'))
                    .filter(|token| !token.is_empty())
                {
                    let locale = normalize_locale(token);
                    if matches!(locale, AppLocale::Zh | AppLocale::Ja | AppLocale::En) {
                        return locale;
                    }
                }
            }
        }
    }

    for key in ["LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(value) = std::env::var(key) {
            let locale = normalize_locale(&value);
            if matches!(locale, AppLocale::Zh | AppLocale::Ja | AppLocale::En) {
                return locale;
            }
        }
    }

    AppLocale::Zh
}

fn tr(locale: AppLocale, key: &str) -> &'static str {
    match locale {
        AppLocale::En => match key {
            "about" => "About TypeFree",
            "allFiles" => "All Files",
            "appearance" => "Appearance",
            "blockTransition" => "Block Transition",
            "cancel" => "Cancel",
            "close" => "Close",
            "clearRecent" => "Clear Recent",
            "copy" => "Copy",
            "cut" => "Cut",
            "dark" => "Dark",
            "dontSave" => "Don't Save",
            "edit" => "Edit",
            "enterKeyBehavior" => "Enter Key Behavior",
            "file" => "File",
            "front" => "Bring All to Front",
            "fullScreen" => "Toggle Full Screen",
            "hide" => "Hide TypeFree",
            "hideOthers" => "Hide Others",
            "language" => "Language",
            "languageChinese" => "Chinese",
            "languageEnglish" => "English",
            "languageJapanese" => "Japanese",
            "light" => "Light",
            "markdownDocuments" => "Markdown Documents",
            "minimize" => "Minimize",
            "newDocument" => "New",
            "newline" => "Newline",
            "noRecentDocuments" => "No Recent Documents",
            "none" => "None",
            "open" => "Open...",
            "openRecent" => "Open Recent",
            "paragraph" => "Paragraph",
            "paste" => "Paste",
            "quit" => "Quit TypeFree",
            "redo" => "Redo",
            "save" => "Save",
            "saveAs" => "Save As...",
            "saveOnCloseFailed" => "Failed to save the document before closing.",
            "savePromptDetail" => "Your changes will be lost if you do not save them.",
            "savePromptMessage" => "Do you want to save changes to {fileName}?",
            "selectAll" => "Select All",
            "services" => "Services",
            "settings" => "Settings",
            "smooth" => "Smooth",
            "sourceMode" => "Source Mode",
            "system" => "System",
            "undo" => "Undo",
            "unhide" => "Show All",
            "untitled" => "Untitled.md",
            "view" => "View",
            "window" => "Window",
            "zoom" => "Zoom",
            _ => "",
        },
        AppLocale::Zh => match key {
            "about" => "关于 TypeFree",
            "allFiles" => "所有文件",
            "appearance" => "外观",
            "blockTransition" => "段落切换动画",
            "cancel" => "取消",
            "close" => "关闭",
            "clearRecent" => "清除最近文件",
            "copy" => "复制",
            "cut" => "剪切",
            "dark" => "深色",
            "dontSave" => "不保存",
            "edit" => "编辑",
            "enterKeyBehavior" => "回车行为",
            "file" => "文件",
            "front" => "全部置于顶层",
            "fullScreen" => "切换全屏",
            "hide" => "隐藏 TypeFree",
            "hideOthers" => "隐藏其他",
            "language" => "语言",
            "languageChinese" => "中文",
            "languageEnglish" => "英语",
            "languageJapanese" => "日语",
            "light" => "浅色",
            "markdownDocuments" => "Markdown 文档",
            "minimize" => "最小化",
            "newDocument" => "新建",
            "newline" => "换行",
            "noRecentDocuments" => "没有最近文件",
            "none" => "关闭",
            "open" => "打开...",
            "openRecent" => "最近打开",
            "paragraph" => "新段落",
            "paste" => "粘贴",
            "quit" => "退出 TypeFree",
            "redo" => "重做",
            "save" => "保存",
            "saveAs" => "另存为...",
            "saveOnCloseFailed" => "关闭前保存文档失败。",
            "savePromptDetail" => "如果不保存，你的修改将会丢失。",
            "savePromptMessage" => "要保存对 {fileName} 的修改吗？",
            "selectAll" => "全选",
            "services" => "服务",
            "settings" => "设置",
            "smooth" => "平滑",
            "sourceMode" => "源码模式",
            "system" => "跟随系统",
            "undo" => "撤销",
            "unhide" => "显示全部",
            "untitled" => "未命名.md",
            "view" => "视图",
            "window" => "窗口",
            "zoom" => "缩放",
            _ => "",
        },
        AppLocale::Ja => match key {
            "about" => "TypeFree について",
            "allFiles" => "すべてのファイル",
            "appearance" => "外観",
            "blockTransition" => "ブロック切り替え",
            "cancel" => "キャンセル",
            "close" => "閉じる",
            "clearRecent" => "最近使った項目を消去",
            "copy" => "コピー",
            "cut" => "切り取り",
            "dark" => "ダーク",
            "dontSave" => "保存しない",
            "edit" => "編集",
            "enterKeyBehavior" => "Enter キーの動作",
            "file" => "ファイル",
            "front" => "すべてを手前に移動",
            "fullScreen" => "フルスクリーン切り替え",
            "hide" => "TypeFree を隠す",
            "hideOthers" => "ほかを隠す",
            "language" => "言語",
            "languageChinese" => "中国語",
            "languageEnglish" => "英語",
            "languageJapanese" => "日本語",
            "light" => "ライト",
            "markdownDocuments" => "Markdown ドキュメント",
            "minimize" => "最小化",
            "newDocument" => "新規",
            "newline" => "改行",
            "noRecentDocuments" => "最近使った項目はありません",
            "none" => "なし",
            "open" => "開く...",
            "openRecent" => "最近使った項目を開く",
            "paragraph" => "段落",
            "paste" => "貼り付け",
            "quit" => "TypeFree を終了",
            "redo" => "やり直し",
            "save" => "保存",
            "saveAs" => "名前を付けて保存...",
            "saveOnCloseFailed" => "終了前に文書を保存できませんでした。",
            "savePromptDetail" => "保存しない場合、変更内容は失われます。",
            "savePromptMessage" => "{fileName} への変更を保存しますか？",
            "selectAll" => "すべてを選択",
            "services" => "サービス",
            "settings" => "設定",
            "smooth" => "滑らか",
            "sourceMode" => "ソースモード",
            "system" => "システム",
            "undo" => "取り消す",
            "unhide" => "すべて表示",
            "untitled" => "無題.md",
            "view" => "表示",
            "window" => "ウィンドウ",
            "zoom" => "ズーム",
            _ => "",
        },
    }
}

fn locale_label(ui_locale: AppLocale, locale: AppLocale) -> &'static str {
    match locale {
        AppLocale::En => tr(ui_locale, "languageEnglish"),
        AppLocale::Zh => tr(ui_locale, "languageChinese"),
        AppLocale::Ja => tr(ui_locale, "languageJapanese"),
    }
}

fn normalize_choice(value: &str, allowed: &[&str], fallback: &str) -> String {
    if allowed.iter().any(|candidate| *candidate == value) {
        value.to_string()
    } else {
        fallback.to_string()
    }
}

fn app_data_file(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    Ok(data_dir.join(RECENT_DOCUMENTS_FILE))
}

fn load_recent_documents(app: &AppHandle) -> Vec<String> {
    let Ok(path) = app_data_file(app) else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(&raw)
        .unwrap_or_default()
        .into_iter()
        .filter(|path| !path.trim().is_empty())
        .collect()
}

fn persist_recent_documents(app: &AppHandle, documents: &[String]) -> Result<(), String> {
    let path = app_data_file(app)?;
    let raw = serde_json::to_string_pretty(documents).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

fn file_name_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn read_document_from_path(path: &Path) -> Result<OpenDocumentPayload, String> {
    if !path.is_file() {
        return Err(format!("Unsupported document path: {}", path.display()));
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(OpenDocumentPayload {
        content,
        file_path: path.to_string_lossy().to_string(),
        name: file_name_from_path(path),
    })
}

fn save_document_to_path(content: &str, path: &Path) -> Result<SavedDocument, String> {
    fs::write(path, content).map_err(|error| error.to_string())?;
    Ok(SavedDocument {
        file_path: path.to_string_lossy().to_string(),
        name: file_name_from_path(path),
    })
}

fn file_path_to_path_buf(file_path: FilePath) -> Result<PathBuf, String> {
    file_path.into_path().map_err(|error| error.to_string())
}

fn add_text_filters<R: tauri::Runtime>(
    dialog: FileDialogBuilder<R>,
    locale: AppLocale,
) -> FileDialogBuilder<R> {
    dialog
        .add_filter(
            tr(locale, "markdownDocuments"),
            &["md", "markdown", "mdown", "mkd", "txt"],
        )
        .add_filter(tr(locale, "allFiles"), &["*"])
}

fn apply_default_path<R: tauri::Runtime>(
    mut dialog: FileDialogBuilder<R>,
    default_path: Option<&str>,
) -> FileDialogBuilder<R> {
    let Some(default_path) = default_path.filter(|value| !value.trim().is_empty()) else {
        return dialog;
    };

    let path = Path::new(default_path);
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        dialog = dialog.set_directory(parent);
    }

    if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
        dialog = dialog.set_file_name(name);
    }

    dialog
}

fn rename_document_path(file_path: &str, next_name: &str) -> Result<SavedDocument, String> {
    let current_path = PathBuf::from(file_path);
    if !current_path.is_file() {
        return Err(format!(
            "Unsupported document path: {}",
            current_path.display()
        ));
    }

    let trimmed_name = next_name.trim();
    if trimmed_name.is_empty() {
        return Err("Missing target file name".to_string());
    }

    let requested_name = Path::new(trimmed_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(trimmed_name);

    let current_extension = current_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| format!(".{extension}"))
        .unwrap_or_default();
    let normalized_name = if Path::new(requested_name).extension().is_some() {
        requested_name.to_string()
    } else {
        format!("{requested_name}{current_extension}")
    };
    let target_directory = current_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let initial_target = target_directory.join(&normalized_name);

    if initial_target == current_path {
        return Ok(SavedDocument {
            file_path: current_path.to_string_lossy().to_string(),
            name: file_name_from_path(&current_path),
        });
    }

    let target_extension = initial_target
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| format!(".{extension}"))
        .unwrap_or_default();
    let target_stem = initial_target
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| normalized_name.clone());

    let mut resolved_target = initial_target;
    let mut sequence = 0;
    while resolved_target.exists() {
        sequence += 1;
        resolved_target =
            target_directory.join(format!("{} ({sequence}){target_extension}", target_stem));
    }

    fs::rename(&current_path, &resolved_target).map_err(|error| error.to_string())?;
    Ok(SavedDocument {
        file_path: resolved_target.to_string_lossy().to_string(),
        name: file_name_from_path(&resolved_target),
    })
}

fn add_recent_document(app: &AppHandle, file_path: &str) -> Result<(), String> {
    let snapshot = {
        let state = app.state::<Mutex<AppState>>();
        let mut state = state.lock().map_err(|error| error.to_string())?;
        state.recent_documents.retain(|item| item != file_path);
        state.recent_documents.insert(0, file_path.to_string());
        state.recent_documents.truncate(10);
        state.recent_documents.clone()
    };

    persist_recent_documents(app, &snapshot)?;
    rebuild_menu(app).map_err(|error| error.to_string())
}

fn clear_recent_documents(app: &AppHandle) -> Result<(), String> {
    {
        let state = app.state::<Mutex<AppState>>();
        let mut state = state.lock().map_err(|error| error.to_string())?;
        state.recent_documents.clear();
    }

    persist_recent_documents(app, &[])?;
    rebuild_menu(app).map_err(|error| error.to_string())
}

fn tr_prompt(locale: AppLocale, key: &str, file_name: &str) -> String {
    tr(locale, key).replace("{fileName}", file_name)
}

fn emit_menu_action(app: &AppHandle, action: &str, payload: Option<Value>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.emit(
            "typefree-menu-action",
            MenuActionEvent {
                action: action.to_string(),
                payload,
            },
        );
    }
}

fn emit_open_document(app: &AppHandle, document: OpenDocumentPayload) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.emit("typefree-open-document-request", document);
    }
}

fn open_document_in_window(app: &AppHandle, file_path: &str) -> Result<(), String> {
    let document = read_document_from_path(Path::new(file_path))?;
    emit_open_document(app, document);
    add_recent_document(app, file_path)
}

fn build_recent_submenu(
    app: &AppHandle,
    locale: AppLocale,
    recent_documents: &[String],
) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    let mut builder = SubmenuBuilder::with_id(app, "open-recent", tr(locale, "openRecent"));

    if recent_documents.is_empty() {
        let empty = MenuItemBuilder::with_id("recent-empty", tr(locale, "noRecentDocuments"))
            .enabled(false)
            .build(app)?;
        return builder.item(&empty).build();
    }

    for (index, file_path) in recent_documents.iter().enumerate() {
        let path = Path::new(file_path);
        let item =
            MenuItemBuilder::with_id(format!("open-recent-{index}"), file_name_from_path(path))
                .build(app)?;
        builder = builder.item(&item);
    }

    let clear = MenuItemBuilder::with_id("clear-recent", tr(locale, "clearRecent")).build(app)?;
    builder.separator().item(&clear).build()
}

fn build_application_menu(
    app: &AppHandle,
    state: &AppState,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let locale = state.ui.locale;
    let app_menu = SubmenuBuilder::new(app, APP_NAME)
        .about_with_text(tr(locale, "about"), None)
        .separator()
        .services_with_text(tr(locale, "services"))
        .separator()
        .hide_with_text(tr(locale, "hide"))
        .hide_others_with_text(tr(locale, "hideOthers"))
        .show_all_with_text(tr(locale, "unhide"))
        .separator()
        .quit_with_text(tr(locale, "quit"))
        .build()?;

    let new_file = MenuItemBuilder::with_id("new-file", tr(locale, "newDocument"))
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_file = MenuItemBuilder::with_id("open-file", tr(locale, "open"))
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let save_file = MenuItemBuilder::with_id("save-file", tr(locale, "save"))
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_file_as = MenuItemBuilder::with_id("save-file-as", tr(locale, "saveAs"))
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let recent_menu = build_recent_submenu(app, locale, &state.recent_documents)?;
    let file_menu = SubmenuBuilder::new(app, tr(locale, "file"))
        .item(&new_file)
        .separator()
        .item(&open_file)
        .item(&recent_menu)
        .separator()
        .item(&save_file)
        .item(&save_file_as)
        .separator()
        .close_window_with_text(tr(locale, "close"))
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, tr(locale, "edit"))
        .undo_with_text(tr(locale, "undo"))
        .redo_with_text(tr(locale, "redo"))
        .separator()
        .cut_with_text(tr(locale, "cut"))
        .copy_with_text(tr(locale, "copy"))
        .paste_with_text(tr(locale, "paste"))
        .select_all_with_text(tr(locale, "selectAll"))
        .build()?;

    let source_mode = CheckMenuItemBuilder::with_id("set-source-mode", tr(locale, "sourceMode"))
        .checked(state.ui.view_mode == "raw")
        .accelerator("CmdOrCtrl+\\")
        .build(app)?;
    let view_menu = SubmenuBuilder::new(app, tr(locale, "view"))
        .item(&source_mode)
        .separator()
        .fullscreen_with_text(tr(locale, "fullScreen"))
        .build()?;

    let light = CheckMenuItemBuilder::with_id("set-theme-light", tr(locale, "light"))
        .checked(state.ui.theme_mode == "light")
        .build(app)?;
    let dark = CheckMenuItemBuilder::with_id("set-theme-dark", tr(locale, "dark"))
        .checked(state.ui.theme_mode == "dark")
        .build(app)?;
    let system = CheckMenuItemBuilder::with_id("set-theme-system", tr(locale, "system"))
        .checked(state.ui.theme_mode == "system")
        .build(app)?;
    let appearance_menu = SubmenuBuilder::new(app, tr(locale, "appearance"))
        .item(&light)
        .item(&dark)
        .item(&system)
        .build()?;

    let language_en =
        CheckMenuItemBuilder::with_id("set-locale-en", locale_label(locale, AppLocale::En))
            .checked(state.ui.locale == AppLocale::En)
            .build(app)?;
    let language_zh =
        CheckMenuItemBuilder::with_id("set-locale-zh", locale_label(locale, AppLocale::Zh))
            .checked(state.ui.locale == AppLocale::Zh)
            .build(app)?;
    let language_ja =
        CheckMenuItemBuilder::with_id("set-locale-ja", locale_label(locale, AppLocale::Ja))
            .checked(state.ui.locale == AppLocale::Ja)
            .build(app)?;
    let language_menu = SubmenuBuilder::new(app, tr(locale, "language"))
        .item(&language_en)
        .item(&language_zh)
        .item(&language_ja)
        .build()?;

    let enter_newline =
        CheckMenuItemBuilder::with_id("set-enter-mode-newline", tr(locale, "newline"))
            .checked(state.ui.enter_mode == "newline")
            .build(app)?;
    let enter_paragraph =
        CheckMenuItemBuilder::with_id("set-enter-mode-paragraph", tr(locale, "paragraph"))
            .checked(state.ui.enter_mode == "paragraph")
            .build(app)?;
    let enter_menu = SubmenuBuilder::new(app, tr(locale, "enterKeyBehavior"))
        .item(&enter_newline)
        .item(&enter_paragraph)
        .build()?;

    let transition_smooth =
        CheckMenuItemBuilder::with_id("set-block-transition-smooth", tr(locale, "smooth"))
            .checked(state.ui.block_transition == "smooth")
            .build(app)?;
    let transition_none =
        CheckMenuItemBuilder::with_id("set-block-transition-none", tr(locale, "none"))
            .checked(state.ui.block_transition == "none")
            .build(app)?;
    let transition_menu = SubmenuBuilder::new(app, tr(locale, "blockTransition"))
        .item(&transition_smooth)
        .item(&transition_none)
        .build()?;

    let settings_menu = SubmenuBuilder::new(app, tr(locale, "settings"))
        .item(&appearance_menu)
        .item(&language_menu)
        .item(&enter_menu)
        .item(&transition_menu)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, tr(locale, "window"))
        .minimize_with_text(tr(locale, "minimize"))
        .maximize_with_text(tr(locale, "zoom"))
        .separator()
        .show_all_with_text(tr(locale, "front"))
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &settings_menu,
            &window_menu,
        ])
        .build()
}

fn rebuild_menu(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<Mutex<AppState>>();
    let state = state.lock().expect("app state mutex poisoned");
    let menu = build_application_menu(app, &state)?;
    app.set_menu(menu)?;
    Ok(())
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    if let Some(index) = id.strip_prefix("open-recent-") {
        let Ok(index) = index.parse::<usize>() else {
            return;
        };
        let file_path = {
            let state = app.state::<Mutex<AppState>>();
            let state = state.lock().expect("app state mutex poisoned");
            state.recent_documents.get(index).cloned()
        };
        if let Some(file_path) = file_path {
            if let Err(error) = open_document_in_window(app, &file_path) {
                eprintln!("failed to open recent document: {error}");
            }
        }
        return;
    }

    match id {
        "new-file" => emit_menu_action(app, "new-file", None),
        "open-file" => emit_menu_action(app, "open-file", None),
        "save-file" => emit_menu_action(app, "save-file", None),
        "save-file-as" => emit_menu_action(app, "save-file-as", None),
        "clear-recent" => {
            if let Err(error) = clear_recent_documents(app) {
                eprintln!("failed to clear recent documents: {error}");
            }
        }
        "set-source-mode" => {
            let enabled = {
                let state = app.state::<Mutex<AppState>>();
                let state = state.lock().expect("app state mutex poisoned");
                state.ui.view_mode != "raw"
            };
            emit_menu_action(app, "set-source-mode", Some(json!({ "enabled": enabled })));
        }
        "set-locale-en" => emit_menu_action(app, "set-locale", Some(json!({ "locale": "en" }))),
        "set-locale-zh" => emit_menu_action(app, "set-locale", Some(json!({ "locale": "zh" }))),
        "set-locale-ja" => emit_menu_action(app, "set-locale", Some(json!({ "locale": "ja" }))),
        "set-theme-light" => emit_menu_action(app, "set-theme-light", None),
        "set-theme-dark" => emit_menu_action(app, "set-theme-dark", None),
        "set-theme-system" => emit_menu_action(app, "set-theme-system", None),
        "set-enter-mode-newline" => emit_menu_action(app, "set-enter-mode-newline", None),
        "set-enter-mode-paragraph" => emit_menu_action(app, "set-enter-mode-paragraph", None),
        "set-block-transition-smooth" => emit_menu_action(app, "set-block-transition-smooth", None),
        "set-block-transition-none" => emit_menu_action(app, "set-block-transition-none", None),
        _ => {}
    }
}

fn handle_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            let label = window.label().to_string();
            let should_prevent_close = {
                let state = window.app_handle().state::<Mutex<AppState>>();
                let state = state.lock().expect("app state mutex poisoned");

                state
                    .documents
                    .get(&label)
                    .map(|document| document.dirty)
                    .unwrap_or(false)
            };

            if should_prevent_close {
                api.prevent_close();
            };
        }
        WindowEvent::Destroyed => {
            let label = window.label().to_string();
            let state = window.app_handle().state::<Mutex<AppState>>();
            match state.lock() {
                Ok(mut state) => {
                    state.documents.remove(&label);
                }
                Err(error) => eprintln!("failed to lock app state: {error}"),
            };
        }
        WindowEvent::ThemeChanged(theme) => {
            let payload = match format!("{theme:?}").to_lowercase().as_str() {
                "dark" => "dark",
                _ => "light",
            };
            if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                let _ = webview.emit("typefree-system-theme-change", payload);
            }
        }
        _ => {}
    }
}

#[tauri::command]
async fn open_file(window: WebviewWindow) -> Result<OpenFileResult, String> {
    let app = window.app_handle().clone();
    let locale = {
        let state = app.state::<Mutex<AppState>>();
        let state = state.lock().map_err(|error| error.to_string())?;
        state.ui.locale
    };
    let selected = add_text_filters(window.dialog().file(), locale).blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(OpenFileResult {
            canceled: true,
            content: None,
            file_path: None,
            name: None,
        });
    };

    let path = file_path_to_path_buf(selected)?;
    let document = read_document_from_path(&path)?;
    add_recent_document(&app, &document.file_path)?;
    Ok(OpenFileResult {
        canceled: false,
        content: Some(document.content),
        file_path: Some(document.file_path),
        name: Some(document.name),
    })
}

#[tauri::command]
async fn save_file(
    window: WebviewWindow,
    payload: SaveFilePayload,
) -> Result<SaveFileResult, String> {
    let app = window.app_handle().clone();
    let locale = {
        let state = app.state::<Mutex<AppState>>();
        let state = state.lock().map_err(|error| error.to_string())?;
        state.ui.locale
    };

    let save_as = payload.save_as.unwrap_or(false);
    let mut target_path = payload
        .file_path
        .as_ref()
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from);

    if target_path.is_none() || save_as {
        let dialog = add_text_filters(window.dialog().file(), locale);
        let dialog = apply_default_path(dialog, payload.default_path.as_deref());
        let selected = dialog.blocking_save_file();
        let Some(selected) = selected else {
            return Ok(SaveFileResult {
                canceled: true,
                file_path: None,
                name: None,
            });
        };
        target_path = Some(file_path_to_path_buf(selected)?);
    }

    let target_path = target_path.ok_or_else(|| "Missing target file path".to_string())?;
    let saved = save_document_to_path(&payload.content, &target_path)?;
    add_recent_document(&app, &saved.file_path)?;

    Ok(SaveFileResult {
        canceled: false,
        file_path: Some(saved.file_path),
        name: Some(saved.name),
    })
}

#[tauri::command]
async fn rename_file(
    window: WebviewWindow,
    payload: RenameFilePayload,
) -> Result<SavedDocument, String> {
    let app = window.app_handle().clone();
    let saved = rename_document_path(&payload.file_path, &payload.next_name)?;
    {
        let state = app.state::<Mutex<AppState>>();
        let mut state = state.lock().map_err(|error| error.to_string())?;
        for document in state.documents.values_mut() {
            if document.file_path.as_deref() == Some(payload.file_path.as_str()) {
                document.file_path = Some(saved.file_path.clone());
                document.file_name = saved.name.clone();
            }
        }
        state
            .recent_documents
            .iter_mut()
            .filter(|item| **item == payload.file_path)
            .for_each(|item| *item = saved.file_path.clone());
    }
    add_recent_document(&app, &saved.file_path)?;
    Ok(saved)
}

#[tauri::command]
async fn confirm_close(
    window: WebviewWindow,
    state: State<'_, Mutex<AppState>>,
    payload: ConfirmClosePayload,
) -> Result<String, String> {
    let locale = {
        let state = state.lock().map_err(|error| error.to_string())?;
        state.ui.locale
    };
    let file_name = if payload.file_name.trim().is_empty() {
        tr(locale, "untitled").to_string()
    } else {
        payload.file_name
    };
    let save_label = tr(locale, "save").to_string();
    let dont_save_label = tr(locale, "dontSave").to_string();
    let cancel_label = tr(locale, "cancel").to_string();

    let (tx, mut rx) = tauri::async_runtime::channel(1);
    window
        .dialog()
        .message(tr_prompt(locale, "savePromptMessage", &file_name))
        .parent(&window)
        .title(APP_NAME)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            save_label.clone(),
            dont_save_label.clone(),
            cancel_label,
        ))
        .show_with_result(move |result| {
            let _ = tx.try_send(result);
        });

    let result = rx
        .recv()
        .await
        .ok_or_else(|| "Close confirmation dialog was dismissed unexpectedly".to_string())?;
    let decision = match result {
        MessageDialogResult::Custom(value) if value == save_label => "save",
        MessageDialogResult::Custom(value) if value == dont_save_label => "discard",
        MessageDialogResult::Yes => "save",
        MessageDialogResult::No => "discard",
        _ => "cancel",
    };

    Ok(decision.to_string())
}

#[tauri::command]
fn update_document_state(
    window: WebviewWindow,
    state: State<'_, Mutex<AppState>>,
    payload: DocumentStatePayload,
) -> Result<(), String> {
    let label = window.label().to_string();
    let title = format!(
        "{}{} - {APP_NAME}",
        if payload.dirty { "• " } else { "" },
        payload.file_name
    );

    {
        let mut state = state.lock().map_err(|error| error.to_string())?;
        state.documents.insert(label, payload);
    }

    let _ = window.set_title(&title);
    Ok(())
}

#[tauri::command]
fn update_editor_ui_state(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    payload: EditorUiStatePayload,
) -> Result<(), String> {
    {
        let mut state = state.lock().map_err(|error| error.to_string())?;
        state.ui = EditorUiState {
            locale: payload.locale,
            theme_mode: normalize_choice(
                &payload.theme_mode,
                &["light", "dark", "system"],
                "system",
            ),
            enter_mode: normalize_choice(
                &payload.enter_mode,
                &["newline", "paragraph"],
                "paragraph",
            ),
            block_transition: normalize_choice(
                &payload.block_transition,
                &["smooth", "none"],
                "smooth",
            ),
            view_mode: normalize_choice(&payload.view_mode, &["raw", "wysiwyg"], "wysiwyg"),
        };
    }

    rebuild_menu(&app).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let recent_documents = load_recent_documents(app.handle());
            {
                let state = app.state::<Mutex<AppState>>();
                let mut state = state.lock().expect("app state mutex poisoned");
                state.recent_documents = recent_documents;
            }
            rebuild_menu(app.handle())?;
            Ok(())
        })
        .manage(Mutex::new(AppState::new()))
        .invoke_handler(tauri::generate_handler![
            open_file,
            save_file,
            rename_file,
            confirm_close,
            update_document_state,
            update_editor_ui_state
        ])
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().0.as_str());
        })
        .on_window_event(handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
