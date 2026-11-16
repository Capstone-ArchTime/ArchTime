// Generator of outline.claude.json (reference A, AI-written). Reference B writers must not open this file.
// Usage: git -C <outline checkout> ls-files | <filter: JS/TS, isAnalyzable> > files.txt; node outline.claude.rules.cjs files.txt outline.claude.json
// Builds reference A of outline/outline by function, assigning individual files (rq1-protocol §2.3: "a prefix can be
// the full path of a file"). Directory rules first, then keyword rules on the file name and its folder, in priority
// order. The rules are written into the reference's note so a reviewer can check every assignment.
const fs = require('fs');
const [, , listFile, outFile] = process.argv;
const files = fs.readFileSync(listFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);

const COMPONENTS = {
  documents: ['Documents', 'Documents and their lifecycle: create, edit, publish, move, archive, delete and restore, revisions and history, templates, drafts, stars, pins, views, backlinks and document relationships.'],
  collections: ['Collections', 'Collections that group documents: structure, ordering, settings and their pages.'],
  editor: ['Editor', 'The ProseMirror-based rich-text editor shared by client and server: schema, marks, nodes, commands, plugins, and its React components.'],
  realtime: ['Real-time collaboration', 'Multiplayer editing (Y.js collaboration server), websockets and presence.'],
  search: ['Search', 'Full-text search of documents and collections, search history, and the Postgres search plugin.'],
  comments: ['Comments and reactions', 'Comment threads on documents and emoji reactions.'],
  access: ['Sharing and access control', 'Authorization policies (cancan), public shares, user and group memberships of documents and collections, access requests.'],
  users: ['Users, teams and groups', 'User accounts and profiles, workspaces (teams), groups, invitations, preferences, custom emojis and onboarding.'],
  auth: ['Authentication and API access', 'Sign-in (email magic link, passkeys, Google, Azure, OIDC), sessions, API keys and the OAuth provider for third-party clients.'],
  notifications: ['Notifications and email', 'In-app notifications, document subscriptions and transactional emails.'],
  importexport: ['Import and export', 'Importing from Markdown, JSON, Notion and Slab, exporting workspaces and collections (file operations), and document format converters.'],
  attachments: ['Attachments and file storage', 'Uploaded files and images, avatars and the storage back ends (local, S3).'],
  integrations: ['Integrations', 'Third-party integrations as plugins (Slack, GitHub, GitLab, Gitea, Linear, Figma, Zapier, webhooks, link unfurling, diagrams, analytics), integration settings and the MCP server.'],
  server: ['API server and background jobs', 'Koa API server set-up, routing and middlewares, event bus and queue infrastructure, services (web, worker, cron), configuration, logging, database migrations and base models.'],
  appshell: ['Web app shell', 'The React / MobX application frame: routes, root stores and base models, layout, sidebar, navigation, settings scenes, generic components, hooks, menus and utilities.'],
  shared: ['Shared utilities and styles', 'Code shared by client and server: utilities, types, styles, shared components, i18n set-up and constants.'],
};

const PLUGINS = {
  azure: 'auth', google: 'auth', oidc: 'auth', passkeys: 'auth', email: 'auth',
  slack: 'integrations', github: 'integrations', gitlab: 'integrations', gitea: 'integrations', linear: 'integrations', figma: 'integrations',
  zapier: 'integrations', webhooks: 'integrations', iframely: 'integrations', diagrams: 'integrations', discord: 'integrations',
  googleanalytics: 'integrations', matomo: 'integrations', umami: 'integrations', enterprise: 'integrations',
  notion: 'importexport', slab: 'importexport', storage: 'attachments', 'search-postgres': 'search',
};

// Directory rules: [prefix, component]. Checked first; the longest prefix wins.
const DIRS = [
  ['shared/editor/', 'editor'], ['app/editor/', 'editor'], ['server/editor/', 'editor'],
  ['server/collaboration/', 'realtime'], ['shared/collaboration/', 'realtime'],
  ['server/migrations/', 'server'], ['server/logging/', 'server'], ['server/services/', 'server'], ['server/config/', 'server'],
  ['server/scripts/', 'server'], ['server/mcp/', 'integrations'], ['server/storage/', 'attachments'], ['server/converters/', 'importexport'],
  ['server/emails/', 'notifications'], ['shared/i18n/', 'shared'], ['shared/styles/', 'shared'],
  ...Object.entries(PLUGINS).map(([dir, c]) => [`plugins/${dir}/`, c]),
];

// Keyword rules on WORDS of the file name and its folder (camelCase split, lower case), exact match, in priority order.
// The tier folders (app, server, shared) are not words: shared/constants.ts is not about sharing.
const W = list => new Set(list.split(' '));
const KEYWORDS = [
  ['comments', W('comment comments reaction reactions')],
  ['access', W('share shares shared sharing access membership memberships permission permissions policies policy')],
  ['search', W('search searches')],
  ['importexport', W('import imports importer importers export exports exporter operation operations')],
  ['realtime', W('collaboration collaborative collaborator collaborators websocket websockets multiplayer presence')],
  ['notifications', W('notification notifications subscription subscriptions email emails mail mailer')],
  ['auth', W('auth authentication authenticated authorize authorization login logout passkey passkeys oauth key keys session sessions signin signup jwt sso')],
  ['attachments', W('attachment attachments upload uploads uploader avatar avatars storage')],
  ['users', W('user users team teams group groups invite invites invitation invitations preference preferences emoji emojis onboarding profile member members')],
  ['integrations', W('integration integrations webhook webhooks unfurl unfurls embed embeds plugin plugins hover')],
  ['collections', W('collection collections')],
  ['documents', W('document documents revision revisions template templates draft drafts archive archived trash star stars starred pin pins pinned views publish published backlink backlinks relationship relationships suggestion suggestions history')],
];
const TIERS = new Set(['app', 'server', 'shared']);
const words = file => {
  const parts = file.split('/');
  const tail = parts.slice(-2).filter((seg, i, all) => !(i === 0 && all.length === 2 && parts.length === 2 && TIERS.has(seg)));
  return tail.join(' ').replace(/\.[a-z]+$/i, '').split(/[\s/._-]+/)
    .flatMap(w => w.split(/(?<=[a-z0-9])(?=[A-Z])/)).map(w => w.toLowerCase()).filter(Boolean);
};

const FALLBACK = [['app/', 'appshell'], ['server/', 'server'], ['shared/', 'shared']];

const assigned = new Map();
const owner = file => {
  const dir = DIRS.filter(([p]) => file.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0];
  if (dir) return { component: dir[1], by: 'dir', prefix: dir[0] };
  if (!/^(app|server|shared)\//.test(file)) return null; // root config files, .claude, .oxlint
  const ws = words(file);
  const kw = KEYWORDS.find(([, set]) => ws.some(w => set.has(w)));
  if (kw) return { component: kw[0], by: 'file' };
  const fb = FALLBACK.find(([p]) => file.startsWith(p));
  return fb ? { component: fb[1], by: 'file' } : null;
};

const prefixes = Object.fromEntries(Object.keys(COMPONENTS).map(k => [k, new Set()]));
for (const f of files) {
  const o = owner(f);
  if (!o) continue;
  assigned.set(f, o.component);
  prefixes[o.component].add(o.by === 'dir' ? o.prefix : f);
}

const ref = {
  repo: 'outline', commit: 'c0288df8eb4f4b33171e2a26b1f1f51a95f76ae5',
  author: 'Claude (AI assistant) - reference A, AI-written; must be paired with an independent reference B by a team member',
  writtenAt: '2026-11-16',
  note: 'outline is the test-set repository whose folders are organised by tier (app/, server/, shared/) while its functional blocks cut across the tiers (rq1-protocol criterion 4), so this reference assigns individual files. docs/ARCHITECTURE.md gives the tiers; the functional blocks follow the API resources (server/routes/api/*), models, scenes and plugins. Assignment rules, applied in order: (1) folder rules: shared|app|server/editor -> Editor; server|shared/collaboration -> Real-time collaboration; server/emails -> Notifications; server/converters -> Import and export; server/storage -> Attachments; server/mcp -> Integrations; server/migrations, logging, services, config, scripts -> API server; each plugins/<name> by what it is (auth providers, integrations, Notion/Slab importers, storage, Postgres search). (2) Whole words of the file name and its folder (camelCase split, so Spinner is not pin and startup is not star; the tier folders app/server/shared are not words), first match wins: comment, reaction; share, shared, access, membership, permission, policy; search; import, export, operation; collaboration, websocket, presence; notification, subscription, email; auth, authorize, login, logout, oauth, key, session, passkey; attachment, upload, avatar, storage; user, team, group, invite, preference, emoji, onboarding, profile, member; integration, webhook, unfurl, embed, plugin, hover (link previews); collection; document, revision, template, draft, archive, trash, star, pin, views, publish, backlink, relationship, suggestion, history (plurals included). (3) Otherwise app/ -> Web app shell, server/ -> API server, shared/ -> Shared utilities. Root configuration files are left unassigned. Written without any ArchTime output for this repository (it has not been mined).',
  sources: [
    'docs/ARCHITECTURE.md (frontend: React + MobX scenes, stores, models; backend: Koa routes, commands, models, policies, presenters, queues; shared: editor, i18n, utils)',
    'server/routes/api/* (one folder per API resource), server/queues/processors/*, plugins/*/plugin.json',
  ],
  components: Object.entries(COMPONENTS).map(([k, [name, responsibility]]) => ({
    name, responsibility, prefixes: [...prefixes[k]].sort(),
    evidence: k === 'editor' ? ['ARCHITECTURE.md: shared/editor is the ProseMirror text editor; app/editor its React components'] : ['rule-based file assignment; see note'],
  })).filter(c => c.prefixes.length),
};
fs.writeFileSync(outFile, JSON.stringify(ref, null, 2) + '\n');
const counts = {};
for (const c of assigned.values()) counts[c] = (counts[c] ?? 0) + 1;
console.log(ref.components.length, 'components;', assigned.size, 'of', files.length, 'files assigned');
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${COMPONENTS[k][0]}: ${n}`).join('\n'));
