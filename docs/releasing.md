# Piyoyoの配布手順

PiyoyoはGitHub ReleasesへVSIXを添付して配布します。
npmやVisual Studio Marketplaceへの公開登録は不要です。
この手順で使うnpmとnpxは、配布担当者が開発用ツールを実行するためのものです。
Piyoyoを使うために必要なのは、VS CodeとPython、配布されたVSIXです。

## ライセンスとソースコードの配布

PiyoyoはGPL-3.0-onlyで配布します。
`LICENSE`には[GNU公式のGPL v3全文](https://www.gnu.org/licenses/gpl-3.0.txt)を変更せずに収録し、Piyoyoの著作権表示と適用するライセンスは`COPYRIGHT`に記載しています。
2026年9月28日にGNU公式サイトから取得しました。

VSIXを配布するときは、同じ版の完全な対応ソースコードも、同じReleaseページから取得できるようにします。
配布するコミットにタグを付け、GitHubが提供する`Source code (zip)`と`Source code (tar.gz)`に、実行コード、`package.json`、ビルドとインストールの手順、ライセンスが含まれることを確認します。
公開前に、VSIXとタグのソースコードが一致していること、およびソースを取得するリンクがアクセス可能であることを確認します。

公開先を変える場合は、`COPYRIGHT`の著作権名と、README、利用ガイド、`package.json`のGitHubリンクを公開先に揃えます。
GPL条文自体にあるFree Software Foundationの著作権表示は保持します。

## 配布前の確認

1. 配布する変更を確認し、説明書と画面が一致していることを確認します。
2. `package.json`のバージョンを確認します。公開済みの番号は再利用せず、次の配布では番号を上げます。
3. 拡張機能の識別子は`local.piyoyo`です。`publisher`と`name`を変えると別の拡張機能になるため、更新時も維持します。
4. 次のチェックをリポジトリのルートで実行します。

```powershell
npm test
npm run check
git diff --check
```

このリポジトリには実行時依存がなく、現状のテストにも`npm install`は不要です。
テストにはPythonが必要です。
バージョンを変えたときは、パッケージのバージョンを検証するテストの期待値も更新します。

## VSIXの作成

Node.jsとnpmを導入済みの環境で実行します。
初回のツール取得にはネットワーク接続が必要です。

```powershell
npx --yes @vscode/vsce@3.9.2 package --baseImagesUrl https://github.com/latticebold/Piyoyo/raw/v<バージョン> --baseContentUrl https://github.com/latticebold/Piyoyo/blob/v<バージョン> --out dist/piyoyo-<バージョン>.vsix
```

`dist/piyoyo-<バージョン>.vsix`が生成されます。
`--baseImagesUrl`と`--baseContentUrl`で、READMEの画像とリンクをその版のタグに固定します。
固定しないと最新の`main`を参照するため、後から画像を変えたときに古い版の詳細ページで画像が表示されなくなります。
タグは先にGitHubへpushしておきます。
既存の検証用VSIXと混同しないよう、Releaseにはこのファイルだけを添付します。
VSIXはGitの追跡対象外です。

`.vscodeignore`でテスト、開発設定、撮影用データ、配布担当者向け資料を除外しています。
利用者向けのREADME、利用ガイド、PNG画像、実行コード、ロゴ、ライセンスは含めます。
パッケージ作成時のファイル一覧で、除外対象が混入していないか確認してください。
READMEの相対リンクや画像はvsceがGitHub向けURLへ書き換えるため、同じ文書と画像をGitHubにも反映してから配布します。
private期間は、GitHub上の文書や画像の閲覧にもアクセス権が必要です。

## 分離したVS Codeで検証する

普段使う拡張機能と設定から分離するため、作業用フォルダを用意します。
以下はPowerShell用です。

```powershell
$verifyRoot = Join-Path $env:TEMP ('piyoyo-check-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $verifyRoot | Out-Null
$vsixPath = (Resolve-Path '.\piyoyo-0.2.0.vsix').Path
code --user-data-dir "$verifyRoot\profile" --extensions-dir "$verifyRoot\extensions" --install-extension $vsixPath
code --user-data-dir "$verifyRoot\profile" --extensions-dir "$verifyRoot\extensions" --new-window
```

VSIXのファイル名は配布するバージョンに合わせます。
初回案内を閉じ、利用ガイドの手順で次を確認します。

- Installedの一覧にPiyoyoが表示される。
- `main.py`を保存し、入力`3 5`から出力`8`が得られる。
- 空の`snippets.py`へ`deque([start])`を挿入すると、`from collections import deque`が追加され、VS Code上で`start`を編集できる。
- コード整理で非表示と順序変更を保存し、ウィンドウを再読み込みしても維持される。
- エラーやタイムアウト時に日本語の説明を確認でき、詳細設定を有効にすると元のエラーを表示できる。

## スクリーンショットの更新

`docs/images/`には、生成画像ではなくVSIXをインストールしたVS Codeの実画面を保存します。
撮影は説明用ファイルと専用プロファイルで行い、個人のファイル名や通知が写らない状態にします。

0.1.0の撮影条件は、Windows、VS Code 1.137.0 x64、Python 3.14.6、Piyoyo 0.1.0です。
VS Code本体は英語、Piyoyoは日本語表示です。
Dark Modernテーマ、エディタ文字サイズ18、ウィンドウの画像サイズ1206×804、サイドバー幅約500pxで撮影しました。
パンくずとミニマップを非表示にし、補助サイドバーを閉じています。
実行環境には個人フォルダを含まない`C:\Python314\python.exe`を使用しました。

| ファイル | 再撮影する画面 |
| --- | --- |
| `00-overview.png` | READMEの冒頭用。Piyoyoを補助サイドバーに表示し、複数行の標準入力を与えて実行した全体画面。 |
| `01-install-vsix.png` | 拡張機能ビューの`...`を開き、Install from VSIX...を表示する。 |
| `02-installed.png` | Installedの一覧にPiyoyoが表示されている状態。 |
| `03-run-python.png` | 利用ガイドの`main.py`へ`3 5`を入力し、出力`8`と終了コード`0`を表示する。 |
| `04-snippet-edit.png` | 現行UIの項目と計算量を表示する。古い編集欄が写った画像は使用しない。 |
| `05-snippet-inserted.png` | 「コードを挿入」を押し、importと`deque([start])`が入ったエディタを表示する。 |
| `06-organize.png` | コード整理で「1行を文字列で読む」を非表示にし、「1行を整数で読む」を1つ下へ移動する。 |

画像を更新した後は、READMEと利用ガイドをMarkdownプレビューで開き、文字が読めることと手順との一致を確認します。
最終VSIXには更新後の文書と画像を含め、撮影用パッケージと最終パッケージの実行コードが一致していることも確認します。

## GitHub Releaseの作成

1. 検証したコード、文書、画像をコミットしてGitHubへ反映します。
2. リポジトリのReleasesから新しいReleaseを作成します。
3. `v0.2.0`のようにパッケージと一致するタグを選び、検証したコミットを指定します。
4. Release名にバージョンを入れ、変更点、必要環境、利用ガイドへのリンクを記載します。
5. 検証した`piyoyo-<バージョン>.vsix`を添付し、最初は下書きとして保存します。
6. タグ、添付ファイル、説明文を確認して公開します。

利用者にはReleaseの「Assets」からVSIXを選ぶよう案内します。
自動で付く「Source code (zip)」は拡張機能のインストーラーではありません。
更新版も同じ識別子で配布し、利用者には新しいVSIXを再インストールしてもらいます。

privateの間はアクセス権のある人だけがReleaseを閲覧できます。
世界へ公開するときは、履歴を含む公開対象とライセンスを確認してから、別途リポジトリの公開設定を変更します。

## 0.1.0の検証記録

2026年9月19日、Node.js 24.15.0、npm 12.0.2、vsce 3.9.2を使用しました。
ネットワーク制限下でnpxの取得が完了しなかったため、ローカルのnpmキャッシュに取得済みだったvsce 3.9.2のCLIをNode.jsで直接実行してVSIXを作成しました。
利用者がこの環境固有のパスを再現する必要はありません。
通常の作成方法は上記のnpxコマンドです。

既存のHTMLテスト1件を、後続属性を許容する属性存在の検証へ修正し、86件すべてのテストと構文確認が成功しました。
機能の実装と拡張機能の識別情報は変更していません。
WindowsでVSIXのインストール、サンプル実行、自動import付き挿入を実機確認しました。
コード整理の非表示と順序変更が、ウィンドウ再読み込み後も保持されることを確認しました。
最終成果物は`dist/piyoyo-0.1.0.vsix`です。
別の空の拡張機能フォルダへのインストールに成功し、`local.piyoyo@0.1.0`として認識されました。
撮影に使用したVSIXと最終VSIXのJavaScriptおよび`package.json`はバイト単位で一致しています。
最終VSIXには利用ガイドとPNG6枚を同梱し、開発用ファイルの除外と文書のローカルリンクを確認しました。
macOSとLinuxは未検証です。

## 0.2.0の検証記録

2026年9月27日、`npm test`の117件すべてと`npm run check`が成功しました。
`npx --yes @vscode/vsce@3.9.2 package --out dist/piyoyo-0.2.0.vsix`でVSIXを作成しました。
説明生成、実行経路、Webview、仕様書の各ファイルは、VSIX内の内容とSHA-256で一致しています。
WindowsのVS CodeにVSIXをインストールし、拡張機能一覧で`local.piyoyo@0.2.0`を確認しました。

## 0.2.0の不具合修正後の検証記録

2026年9月28日、正式リリース評価で見つかった7件の再現条件を修正しました。
標準入力の書き込みエラー、自動importの位置と文字列判定、子プロセスの停止待機、出力サイズ、UTF-8の境界デコードを回帰検証しています。
CPython 3.14.6とPyPy 3.11.11（PyPy 7.3.18）の両方で、`npm test`の173件すべてが成功しました。
`npm run check`と`git diff --check`も成功しました。

vsce 3.9.2で`dist/piyoyo-0.2.0-verified.vsix`を作成しました。
この環境では、取得済みのvsceをnpmキャッシュからnpxで実行しています。
コードと`package.json`の計17ファイルは、VSIX内の内容とSHA-256で一致しました。
利用者向け資材を含み、テスト、検証フォルダ、リリース評価書、配布担当者向け資料の混入はありません。
分離したVS Codeの拡張機能フォルダへCLIでインストールし、`local.piyoyo@0.2.0`と表示されることを確認しました。
この記録は修正前のVSIXや2026年9月27日のインストール確認とは別の検証です。

検証VSIXのSHA-256は`F15C73824C6D4FAF48F2C7BAC07D69F46339D670A9EF74C8A6BC354EB05C0B1F`です。
GitHub Releaseへ配布する場合は、この修正後の内容から生成したVSIXを使用し、修正前の`dist/piyoyo-0.2.0.vsix`と混同しないでください。
Windowsで親のPythonが先に終了した場合など、子プロセスの停止を確認できないときは、待機を打ち切ってその状態を日本語で表示します。
今回の検証では、最終版のUI操作と最低対応VS Code 1.90の動作確認、Release公開は実施していません。
