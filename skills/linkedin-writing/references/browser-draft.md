# Filling a LinkedIn draft in Chrome

Use the `claude-in-chrome` tools in a new tab. The user is already signed in; never type a password.

## Post composer

- Open `https://www.linkedin.com/feed/?shareActive=true`, or click "Start a post".
- The `type` action does not reach the editor. Dispatch a `paste` event on `[contenteditable="true"][role="textbox"]` with the text as `text/plain`.
- The editor (ProseMirror) drops empty lines from a plain-text paste. After pasting, insert an empty `<p><br></p>` after each paragraph that should stand alone, then confirm by screenshot that the gaps survived.
- A paste can open the media dialog instead. Use it: find the `type="file"` input and `file_upload` the image, then click **Next** to return to the text. Never click the file button itself — it opens a native picker.

## Article editor

- Open `https://www.linkedin.com/article/new/`, dismiss the intro dialog, click **Title** and `type` the title.
- The first edit rewrites the URL to `/article/edit/<id>/` and re-mounts the body editor, so a paste fired in the same script as the title is lost. Paste the body in a second call, against `[aria-label="Article editor content"]`.
- Paste HTML (`text/html`, with `text/plain` as a fallback): `<h2>` becomes LinkedIn's heading, `<ul>`, `<ol>` and `<strong>` survive.
- `selectAll` does not clear the editor. If a test paste left text behind, select it with a DOM `Range` and `execCommand('delete')`; if the first paragraph then comes out as a heading, set it back with **Style → Normal**.
- "Draft – saved" in the corner means the draft persisted.

## Stop line

Leave the Post / Publish / Schedule button for the user, and report the draft URL.
