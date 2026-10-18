# Piyoyo のエージェント向けルール

このファイルは、Codex・Claude Code などの AI エージェントがこのリポジトリで作業するときに**必ず従う**ルールです。
`CLAUDE.md` はこのファイルを読み込むだけの入口です。ルールはこのファイルにだけ書きます。

## 公開リポジトリとしての注意

このリポジトリは https://github.com/latticebold/Piyoyo で**誰でも見られる状態で公開**されています。
ファイル、コミットメッセージ、Issue、Release の説明文のどれにも、次のものを書かないでください。

- PC 内の場所（`C:\Users\...` のような個人フォルダのパス）。例として書くときは `C:\Python\python.exe` のような個人名を含まないパスを使う
- 本名、個人のメールアドレス、`latticebold` 以外の GitHub アカウント名
- 秘密情報（`.env`、API キー、トークン）

コミットする前に、名前とアドレスが公開用になっていることを確認します。

```powershell
git config user.name   # latticebold
git config user.email  # 344184099+latticebold@users.noreply.github.com
```

違っていたらコミットせず、ユーザーに伝えてください。
push 先は `origin`（`latticebold/Piyoyo`）だけです。

## 更新を配るとき（リリース手順）

部員は GitHub Releases の VSIX を入れて使います。更新を配るときは、次の順番を必ず守ります。詳しい背景は `docs/releasing.md` にあります。

1. **バージョンを上げる**：`package.json` の `version` を上げ、`test/packageManifest.test.js` のバージョンの期待値も合わせる。**公開済みの番号は二度と使わない**（同じ番号で作り直さない）。
2. **確認する**：次がすべて成功することを確かめる。

   ```powershell
   npm test
   npm run check
   git diff --check
   ```

3. **コミットして push し、タグを付ける**：タグ名は `v<バージョン>`（例：`v0.3.0`）。タグも `origin` に push する。
4. **VSIX を作る**：README の画像とリンクが、その版のタグを指すように固定する。`<バージョン>` は今回の番号に置き換える。

   ```powershell
   npx --yes @vscode/vsce@3.9.2 package --baseImagesUrl https://github.com/latticebold/Piyoyo/raw/v<バージョン> --baseContentUrl https://github.com/latticebold/Piyoyo/blob/v<バージョン> --out dist/piyoyo-<バージョン>.vsix
   ```

5. **VSIX の中身を確かめる**：VSIX（中身は zip）を展開し、次を確認する。
   - `extension/readme.md` の画像 URL が `latticebold/Piyoyo/raw/v<バージョン>` になっている
   - PC 内のパス、`latticebold` 以外のアカウント名が入っていない
6. **Release を作る**：`v<バージョン>` のタグで Release を作り、**手順 4 で作った VSIX だけ**を添付する。説明文は日本語で、変更点、必要なもの（VS Code 1.90 以降と Python）、インストール方法（Assets の `.vsix` を Install from VSIX... で入れる）を書く。
7. **公開を確認する**：ログインしていない状態でも、Release の VSIX をダウンロードできることを確かめる。

古い検証用の VSIX や、ほかのフォルダにある VSIX は添付しないでください。
