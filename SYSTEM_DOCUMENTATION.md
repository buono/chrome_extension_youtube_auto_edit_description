# YouTube動画説明欄自動編集ツール - システムドキュメント

## 概要
このChrome拡張機能は、YouTube Studioで管理している複数の動画に対して、説明欄の一括編集を自動化するツールです。

## 1. 全体構成図

```mermaid
graph LR
    User[ユーザー] --> Popup[ポップアップUI]
    Popup --> BG[バックグラウンド]
    BG --> CS[コンテンツスクリプト]
    CS --> YT[YouTube Studio]
```

## 2. 全体シーケンス図

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Popup as Popup UI
    participant BG as Background
    participant CS as Content Script
    participant YT as YouTube Studio

    User->>Popup: 設定して処理開始
    Popup->>BG: 処理指示
    BG->>CS: 処理開始
    
    rect rgb(200, 230, 255)
        Note over CS,YT: 動画収集フェーズ
        CS->>YT: 全ページから動画収集
    end
    
    rect rgb(255, 230, 200)
        Note over CS,YT: 編集処理フェーズ
        loop 各動画
            CS->>YT: 説明欄編集・保存
            CS->>BG: 進捗更新
            BG->>Popup: 進捗表示
        end
    end
    
    CS->>BG: 完了通知
    BG->>Popup: 完了表示
```

## 3. 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> 待機中: 拡張機能起動
    
    待機中 --> 設定中: ポップアップ表示
    設定中 --> 処理準備: 処理開始ボタン
    
    処理準備 --> ページ収集中: 動画URL収集開始
    ページ収集中 --> ページ収集中: 次ページへ
    ページ収集中 --> 動画処理中: 全ページ収集完了
    
    動画処理中 --> 編集中: 編集ページ遷移
    編集中 --> 保存中: 説明欄更新
    保存中 --> 動画処理中: 次の動画へ
    保存中 --> 完了: 全動画処理済み
    
    動画処理中 --> 停止中: 停止ボタン
    編集中 --> 停止中: 停止ボタン
    停止中 --> 待機中: クリーンアップ完了
    
    完了 --> 待機中: リセット
    
    処理準備 --> エラー: エラー発生
    ページ収集中 --> エラー: エラー発生
    動画処理中 --> エラー: エラー発生
    エラー --> 待機中: エラー処理
```

## 4. データフロー図

```mermaid
graph LR
    subgraph "入力データ"
        editMode[編集モード<br/>prepend/append<br/>replace/delete]
        insertText[挿入文字列]
        searchText[検索文字列]
        onlyPublic[公開動画のみ]
    end
    
    subgraph "処理フロー"
        collect[動画収集処理]
        filter[フィルタリング]
        edit[説明欄編集処理]
        save[保存処理]
    end
    
    subgraph "永続化データ"
        urlList[動画URLリスト]
        currentIdx[現在のインデックス]
        progress[進捗情報]
    end
    
    subgraph "出力"
        updated[更新済み説明欄]
        status[処理状態]
    end
    
    editMode --> edit
    insertText --> edit
    searchText --> edit
    onlyPublic --> filter
    
    collect --> urlList
    filter --> urlList
    urlList --> edit
    edit --> save
    save --> updated
    
    currentIdx --> progress
    progress --> status
```

## 5. コンポーネント間通信図

```mermaid
graph TB
    subgraph "Message Flow"
        popup[popup.js]
        background[background.js]
        content[content_multipage.js]
        
        popup -->|chrome.runtime.sendMessage| background
        background -->|chrome.tabs.sendMessage| content
        content -->|chrome.runtime.sendMessage| background
        background -->|chrome.runtime.sendMessage| popup
    end
    
    subgraph "Message Types"
        msg1[startProcessing]
        msg2[stopProcessing]
        msg3[updateProgress]
        msg4[processingComplete]
        msg5[error]
    end
    
    msg1 -.-> background
    msg2 -.-> background
    msg3 -.-> popup
    msg4 -.-> popup
    msg5 -.-> popup
```

## 6. 編集モード動作フロー

```mermaid
flowchart TD
    Start([開始]) --> GetMode{編集モード?}
    
    GetMode -->|prepend| CheckPrepend{文字列が<br/>既に存在?}
    CheckPrepend -->|Yes| Skip1[スキップ]
    CheckPrepend -->|No| AddTop[先頭に追加]
    
    GetMode -->|append| CheckAppend{文字列が<br/>既に存在?}
    CheckAppend -->|Yes| Skip2[スキップ]
    CheckAppend -->|No| AddBottom[末尾に追加]
    
    GetMode -->|replace| CheckReplace{検索文字列<br/>が存在?}
    CheckReplace -->|Yes| Replace[全て置換]
    CheckReplace -->|No| Skip3[スキップ]
    
    GetMode -->|delete| CheckDelete{検索文字列<br/>が存在?}
    CheckDelete -->|Yes| Delete[全て削除]
    CheckDelete -->|No| Skip4[スキップ]
    
    AddTop --> Save[保存]
    AddBottom --> Save
    Replace --> Save
    Delete --> Save
    Skip1 --> Next[次の動画へ]
    Skip2 --> Next
    Skip3 --> Next
    Skip4 --> Next
    Save --> Next
    
    Next --> End([終了])
```

## 主要機能

### 1. 複数ページ対応
- YouTube Studioの全ページから動画を自動収集
- ページネーションを自動的に処理

### 2. 編集モード
- **先頭に追加 (prepend)**: 説明欄の最初に文字列を追加
- **末尾に追加 (append)**: 説明欄の最後に文字列を追加
- **置換 (replace)**: 特定の文字列を別の文字列に置換
- **削除 (delete)**: 特定の文字列を削除

### 3. フィルタリング
- 公開動画のみを処理対象にすることが可能
- 限定公開・非公開動画を除外

### 4. 進捗管理
- リアルタイムで処理進捗を表示
- ページリロードしても処理を継続

## ストレージ設計

### LocalStorage
```javascript
{
  "yt_video_urls": "[{href, title}, ...]",  // 処理対象動画リスト
  "yt_current_index": "0",                   // 現在処理中のインデックス
  "yt_auto_processing": "true",              // 自動処理中フラグ
  "yt_only_public": "true"                   // 公開動画のみフラグ
}
```

### Chrome Storage
```javascript
{
  "isProcessing": true,        // 処理中フラグ
  "progress": 0,               // 現在の進捗
  "total": 0,                  // 総動画数
  "editMode": "prepend",       // 編集モード
  "insertText": "...",         // 挿入文字列
  "searchText": "...",         // 検索文字列
  "savedEditMode": "...",      // 保存された編集モード
  "savedInsertText": "...",    // 保存された挿入文字列
  "savedSearchText": "..."     // 保存された検索文字列
}
```

## セキュリティ考慮事項

1. **権限の最小化**: 必要最小限の権限のみを要求
2. **DOM操作の安全性**: `execCommand`を使用してXSS攻撃を防止
3. **URL検証**: YouTube Studio以外のサイトでは動作しない

## トラブルシューティング

### よくある問題と解決策

1. **動画が検出されない**
   - YouTube Studioのコンテンツページで実行しているか確認
   - ページが完全に読み込まれているか確認

2. **説明欄が更新されない**
   - 編集権限があるか確認
   - YouTube側のUI変更に対応が必要な可能性

3. **処理が途中で止まる**
   - ブラウザのタブを閉じていないか確認
   - ネットワーク接続を確認

## 開発者向け情報

### ファイル構成
```
/chrome_extension_youtube_auto_edit_description/
├── manifest.json           # 拡張機能設定
├── popup.html             # ポップアップUI
├── popup.js               # ポップアップロジック
├── popup.css              # ポップアップスタイル
├── content_multipage.js   # コンテンツスクリプト（複数ページ対応）
├── content_simple.js      # コンテンツスクリプト（単一ページ）
└── background.js          # バックグラウンドサービスワーカー
```

### デバッグ方法
1. Chrome拡張機能ページで「デベロッパーモード」を有効化
2. 「サービスワーカー」をクリックしてバックグラウンドコンソールを表示
3. YouTube Studioページで開発者ツールを開いてコンテンツスクリプトのログを確認

### テスト項目
- [ ] 単一ページでの動作確認
- [ ] 複数ページでの動作確認
- [ ] 各編集モードの動作確認
- [ ] 公開/非公開フィルタリングの動作確認
- [ ] エラーハンドリングの確認
- [ ] 処理中断・再開の確認

## 更新履歴

- **v1.0.0**: 初版リリース
  - 基本的な説明欄編集機能
  - 単一ページ対応
  - 4つの編集モード実装
  - 複数ページ対応版を追加