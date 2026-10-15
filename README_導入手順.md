# 箱根駅伝予選会 Multi — START即時・RESET全員版

## 同梱ファイル
- `index.html`：操作画面。STARTの確認なし、最下部にRESET
- `style.css`：画面デザイン
- `app.js`：START・RESET・レースID・GOAL・同期・履歴・CSV
- `firebase-config.js`：**ダミー値**。既存本番用のファイルで必ず置き換える
- `firestore.rules`：**本番Firestoreのルール全文**。GitHubへはアップロード不要
- `sw.js` / `manifest.webmanifest` / `icon-512.png`：PWA関連

## 本番への導入順序（重要）
1. 現在の本番用フォルダーと、Firebaseの現行ルールをバックアップする。
2. ZIPを展開し、**現在の本番 `firebase-config.js` を展開先にコピーして置き換える**。テスト用設定は使わない。
3. Firebase Consoleの**本番** Firestore Database > ルールに `firestore.rules` の全文を貼り、公開する。既存の独自ルールがあれば無条件に上書きせず確認する。
4. GitHubリポジトリ `hakone-yosen-multi` のルートに `index.html`、`app.js`、`style.css`、`sw.js`、`manifest.webmanifest`、`icon-512.png` をアップロードする。既存の**本番 `firebase-config.js` はそのまま維持**する。`firestore.rules` と README は公開不要。
5. GitHub Pagesの公開完了後、強制更新して「レース開始前」「接続中」を確認する。実際のSTARTボタンはレース当日まで押さない。

## RESETの挙動
- STARTは確認ダイアログなし。最初に成功した1件だけが有効。
- RESETは全員が操作可能。RESET時のみ確認ダイアログが表示される。
- RESETするとレースIDが更新され、START時刻が未設定に戻る。次のSTARTで新しいレースを開始できる。
- 過去のGOALはFirestoreに残り、全履歴CSVで確認可能。画面・順位CSVは現在レースのみを集計。
- オフラインGOALはレースID付きで端末に保存。RESET前の未送信記録は次レースに自動送信されず、端末内に保護される。現在のUIでは旧レース未送信分の再送・復元機能はありません。
- 以前のバージョンの未送信キュー（V2）はこの版では自動移行しません。旧版の未送信件数が0であることを公開前に確認してください。

## 注意
- **既存の `raceControl/main` が旧形式（raceIdなし）で作成済みの場合、この版はそのままでは移行できません。** 本番では未作成と確認済みですが、公開前に再確認してください。
- Firebase Webアプリの設定はこのZIPに含まれていません（ダミー値です）。本番設定のコピーが必須です。
- 匿名認証のためRESET権限は全員にあります。悪意ある利用者や誤操作によるリセットを防ぐ権限分離はありません。
- 時刻補正はネットワーク往復からの推定であり、計測器並みの精度を保証しません。
- これはソースコード一式です。実機・本番FirebaseでのRESET動作検証はまだ行っていません。
