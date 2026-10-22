# Piyoyo の開発ルール

Piyoyo は AI エージェント（Codex・Claude Code など）と一緒に開発しています。
このファイルは、人もエージェントも同じルールで作業するための決まりごとです。
`CLAUDE.md` はこのファイルを読み込むだけの入口で、ルールはここにだけ書きます。

## 公開リポジトリで気をつけること

このリポジトリは公開されています。ファイル、コミットメッセージ、Issue、Release の説明文には、次のものを書きません。

- 個人の PC のフォルダのパス。例を書くときは `C:\Python\python.exe` のように個人名を含まないパスにする
- 本名、個人のメールアドレス、リポジトリの持ち主以外のアカウント名
- 秘密情報（`.env`、API キー、トークン）

コミットの作者は、リポジトリの持ち主の GitHub アカウント名と、GitHub が用意する公開用アドレス（`<数字>+<アカウント名>@users.noreply.github.com`）にします。
持ち主は `git remote get-url origin` の URL で分かります。

```powershell
git remote get-url origin   # https://github.com/<持ち主>/Piyoyo.git
git config user.name        # <持ち主>
git config user.email       # <数字>+<持ち主>@users.noreply.github.com
```

違っていたらコミットせずに知らせます。push 先は `origin` だけです。

GitHub の secret scanning とプッシュ保護を有効にしてあり、API キーなどを含む push は GitHub が止めます。止められたら、その秘密情報をコミットから取り除いてから push し直します。

## コミットの粒度

- 1つの機能や修正は、できるだけ1つのコミットにまとめる。作業の途中経過を細かく残さない
- エージェントが別のブランチ（worktree）で作業した場合も、`main` にはまとめて1つのコミットとして入れる（`git merge --squash`）。「Merge branch 'worktree-…'」のようなコミットを残さない
- コミットメッセージは英語で、何を変えたかが1行で分かるように書く

## テスト

push すると、GitHub Actions が Windows 上で `npm test` と `npm run check` を自動で実行します（`.github/workflows/test.yml`）。
`main` が失敗した状態のままにしないでください。

## 更新を配るとき（リリース手順）

部員は GitHub Releases の VSIX を入れて使います。更新を配るときは、次の順番を守ります。詳しい背景は `docs/releasing.md` にあります。

1. **バージョンを上げる**：`package.json` の `version` を上げ、`test/packageManifest.test.js` のバージョンの期待値も合わせる。**公開済みの番号は二度と使わない**（同じ番号で作り直さない）。`CHANGELOG.md` の先頭に、その版の変更点を日本語で追記する。
2. **確認する**：次がすべて成功することを確かめる。

   ```powershell
   npm test
   npm run check
   git diff --check
   ```

3. **コミットして push し、タグを付ける**：タグ名は `v<バージョン>`（例：`v0.3.0`）。タグも `origin` に push する。GitHub Actions のテストが通ったことも確かめる。
4. **VSIX を作る**：README の画像とリンクが、その版のタグを指すように固定する。`<バージョン>` は今回の番号に置き換える。

   ```powershell
   npx --yes @vscode/vsce@3.9.2 package --baseImagesUrl https://github.com/<持ち主>/Piyoyo/raw/v<バージョン> --baseContentUrl https://github.com/<持ち主>/Piyoyo/blob/v<バージョン> --out dist/piyoyo-<バージョン>.vsix
   ```

5. **VSIX の中身を確かめる**：VSIX（中身は zip）を展開し、次を確認する。
   - `extension/readme.md` の画像 URL が `<持ち主>/Piyoyo/raw/v<バージョン>` になっている
   - 個人の PC のパスや、持ち主以外のアカウント名が入っていない
6. **Release を作る**：`v<バージョン>` のタグで Release を作り、**手順 4 で作った VSIX だけ**を添付する。説明文は日本語で、変更点、必要なもの（VS Code 1.90 以降と Python）、インストール方法（Assets の `.vsix` を Install from VSIX... で入れる）を書く。
7. **公開を確認する**：ログインしていない状態でも、Release の VSIX をダウンロードできることを確かめる。

古い検証用の VSIX や、ほかのフォルダにある VSIX は添付しません。
