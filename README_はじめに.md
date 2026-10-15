# 予選会集計ツール Multi（2026年・14大学）

既存の `HakoneYosenLive` とは別の新規プロジェクトです。既存リポジトリを上書きしないでください。

## できること
- 各担当者はログイン後、自分の大学のGOALボタンだけを押す
- GOALは固有IDでローカルに保存され、Firestoreへ自動送信
- 未送信を「一括送信」で再送信（同じIDなので二重登録を防止）
- 管理者はリアルタイムで全大学の10人合計・順位・履歴を確認し、大学修正・論理削除・CSV出力
- 14大学：中央学院、東海、神奈川、東洋、日本体育、東京国際、山梨学院、東京農業、大東文化、立教、法政、明治、専修、国士舘

## セットアップ（順番に）
1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを新規作成。
2. Authentication > Sign-in method で「メール/パスワード」を有効化。
3. Authentication > Users で管理者と大学担当者のアカウントを作成し、それぞれのUIDを控える。
4. Cloud Firestore を作成。`firestore.rules` を Firestore > Rules に貼り付けて公開。
5. Firestore > Data で `users` コレクションを作成し、ドキュメントIDを各UIDにする。管理者は `{role:"admin"}`、担当者は `{role:"operator", university:"中央学院"}` のように設定。大学名はアプリ内の短縮名と完全一致させる。
6. Firebase > Project settings > Your apps > Web app でWebアプリを登録。表示されたfirebaseConfigを `firebase-config.js` に貼る。
7. VS Code Live ServerなどHTTPサーバーで開いてログインを確認。
8. Firebase Authentication > Settings > Authorized domains に実際に利用するホスト名を追加。公開するなら元の手動版とは別のGitHubリポジトリとPagesを使用。
9. まず管理者1人＋担当者2人でテストしてから本番に使う。

## 運用上の重要な注意
- Firebase設定が未入力のため、ZIPを展開しただけではリアルタイム送信できません。
- スマホの時計補正は通信遅延を含む近似です。映像視聴遅延・人間のタップ遅れ・端末の時計ずれがあり、公式タイムと同等の精度は保証できません。
- **同じ放送映像を見て**テストし、秒差の誤差を検証してください。
- ネットワーク不通時は端末内キューへ保存します。ブラウザのデータ消去・端末故障で消えるため、復旧後は一括送信してください。
- 送信後の担当者の誤操作は管理者が履歴で修正・削除します。担当者側の取り消し機能は未実装です。
- 集計の基準時刻は有効な全記録の最も早いタップ時刻です。先頭記録を削除すると全記録の差分が再計算されます。
- Firestoreのアクセス制御は `users` のロールに依存します。**Firestoreのテストモードのまま公開しないでください**。
- この版はFirestoreの全イベントを購読します。数百件程度の想定です。大量運用時は読み取りコスト・購読設計の見直しが必要です。
- `clockSync` に計測ドキュメントが蓄積されます。本番長期運用ではTTL/定期削除を追加してください。
- Firestoreのオフラインキャッシュは有効化していません。未送信キューはlocalStorageです。
