import { apiRequest } from '@/api/client';
import React, { useState, useCallback, useEffect } from 'react';
import { App } from 'antd';
import { motion, AnimatePresence } from 'motion/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PageHeader from '@/components/PageHeader';
import {
  Activity,
  Plus,
  ArrowRight,
  X,
  FolderGit2,
  Loader2,
  Trash2,
  Building2,
  Eye
} from 'lucide-react';
import { Icon } from '@iconify/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import MiningPanel from '@/components/MiningPanel';
import ViewerSettingsModal from '@/components/ViewerSettingsModal';
import TransferProjectModal from '@/components/TransferProjectModal';
import { Link } from 'react-router-dom';
import { byRecent, getWorkspaces, hasMinedHistory, nextStep, STATUS_LABELS, type Workspace } from '@/features/workspace-summary';
import { buildRegistration, listCredentials, listOrganizations, suspensionNotice, workspaceSpaces } from '@/features/organizations-api';
import type { Credential, Organization } from '@/features/organizations-api';

const Projects: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const closeModal = useCallback(() => setIsModalOpen(false), []);
  const [miningProject, setMiningProject] = useState<{ id: string; name: string } | null>(null);
  const [viewerProject, setViewerProject] = useState<{ id: string; name: string } | null>(null);
  const [transferProject, setTransferProject] = useState<{ id: string; name: string } | null>(null);
  const modalRef = useFocusTrap(isModalOpen, closeModal);
  const { message } = App.useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [token, setToken] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  // Where the workspace goes: '' is the personal space; otherwise an organization the account owns.
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [access, setAccess] = useState<'token' | 'credential'>('credential');
  const [credentialId, setCredentialId] = useState('');
  // Without credentials to choose from, an organization workspace clones with a personal token like a personal one.
  const effectiveAccess = organizationId && credentials?.length ? access : 'token';

  // RF-14: the organizations are also read up front, to say why workspaces of a suspended one are not listed.
  useEffect(() => {
    listOrganizations().then(setOrganizations).catch(() => setOrganizations(prev => prev ?? []));
  }, []);
  const suspended = suspensionNotice(organizations ?? []);

  useEffect(() => {
    if (!isModalOpen || organizations) return;
    listOrganizations().then(setOrganizations).catch(() => setOrganizations([]));
  }, [isModalOpen, organizations]);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    listCredentials(organizationId)
      .then(list => { if (active) { setCredentials(list); setCredentialId(list[0]?.id ?? ''); } })
      .catch(() => { if (active) { setCredentials([]); setCredentialId(''); } });
    return () => { active = false; };
  }, [organizationId]);

  const chooseSpace = (id: string) => { setOrganizationId(id); setCredentials(null); setCredentialId(''); };

  const [projectsList, setProjectsList] = useState<Workspace[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const { workspaces } = await getWorkspaces();
      setProjectsList([...workspaces].sort(byRecent));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your workspaces.');
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleConnect = async () => {
    const built = buildRegistration({
      name: projectName, description: projectDescription, repoUrl, visibility: visibility === 'private' ? 'private' : 'public',
      organizationId, access: effectiveAccess, token, credentialId,
    });
    if ('problem' in built) {
      message.error(built.problem);
      return;
    }
    setIsSubmitting(true);
    
    try {
      const data = await apiRequest<{ data: { project: { id: string; name?: string } } }>('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.body),
      });
      {
        const projectId = data.data.project.id;

        // Only read the commit history here; the user chooses what to mine (a date range or everything).
        // A failed scan is not fatal: Manage mining offers it again.
        await apiRequest(`/projects/${projectId}/scan`, { method: 'POST' }).catch(() => undefined);

        message.success('Repository registered. Choose which part of its history to mine.');
        setMiningProject({ id: projectId, name: data.data.project.name ?? projectName });
        fetchProjects();
        closeModal();
        setVisibility('public');
        setToken('');
        setProjectName('');
        setProjectDescription('');
        setRepoUrl('');
        chooseSpace('');
        setAccess('credential');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to register repository');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await apiRequest(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      message.success('Workspace deleted successfully');
      setProjectsList(prev => prev?.filter(p => p.id !== id) ?? prev);
      fetchProjects();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to delete workspace');
    }
  };

  const [search, setSearch] = useState('');
  const filteredProjects = (projectsList ?? []).filter(project => `${project.name} ${project.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pagination = usePagination(filteredProjects, search);
  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10 relative">
        
        {/* HEADER */}
        <div>
          <PageHeader title="Workspaces" summary="Your repositories and their architecture history." actions={
            <button
              onClick={() => setIsModalOpen(true)}
              className="shrink-0 h-10 px-5 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-semibold text-sm transition-colors flex items-center gap-2"
            >
              <Plus size={16} />
              New workspace
            </button>
          } />
        </div>

        {suspended && (
          <div role="status" className="border border-[var(--at-warn)]/40 bg-[var(--at-warn)]/5 p-4 text-sm text-[var(--at-text)]">
            {suspended}
          </div>
        )}

        {loadError && (
          <div role="alert" className="border border-[var(--at-danger)]/40 bg-[var(--at-danger)]/5 p-4 text-sm text-[var(--at-danger-text)] flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <button type="button" onClick={fetchProjects} className="h-8 px-3 border border-[var(--at-danger)]/40 text-xs font-semibold">Try again</button>
          </div>
        )}

        {projectsList === null ? (
          !loadError && <div className="flex items-center justify-center p-12"><Loader2 size={24} className="animate-spin text-[var(--at-link)]" aria-label="Loading workspaces" /></div>
        ) : projectsList.length === 0 ? (
          <section aria-labelledby="first-workspace-title" className="bg-[var(--at-panel)] border border-dashed border-[var(--at-line)] p-10 text-center">
            <FolderGit2 size={28} className="text-[var(--at-link)] mx-auto mb-4" aria-hidden="true" />
            <h3 id="first-workspace-title" className="text-lg font-bold text-[var(--at-text)] mb-2">Create your first workspace</h3>
            <p className="text-sm text-[var(--at-muted)] max-w-md mx-auto mb-6">A workspace connects one Git repository. After creating it you scan its history, mine commits and group files into components.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => setIsModalOpen(true)} className="h-10 px-5 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-bold text-xs flex items-center gap-2">
                <Plus size={16} aria-hidden="true" /> New workspace
              </button>
              <Link to="/workspace/sample/shophub" className="h-10 px-5 bg-[var(--at-panel-2)] hover:bg-[var(--at-line)] border border-[var(--at-line)] text-[var(--at-text)] text-xs font-medium flex items-center">
                Explore a sample workspace
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* PROJECT LIST: the totals in one line next to the search (the Dashboard shows them as tiles). */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input aria-label="Search workspaces" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search workspaces…" className="h-11 w-full max-w-md px-4 border border-[var(--at-line)] bg-[var(--at-panel)] text-sm" />
              <p className="text-sm text-[var(--at-muted)]">
                <span className="text-[var(--at-text)] font-semibold">{projectsList.length}</span> workspaces · <span className="text-[var(--at-text)] font-semibold">{projectsList.filter(hasMinedHistory).length}</span> mined · <span className="text-[var(--at-text)] font-semibold">{projectsList.reduce((sum, p) => sum + (p.totalCommits ?? 0), 0)}</span> commits found
              </p>
            </div>
            {!filteredProjects.length && <p role="status" className="text-[var(--at-muted)] text-sm">No workspaces match your search.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pagination.items.map((project) => {
                const step = nextStep(project);
                return (
                  <div key={project.id} className="bg-[var(--at-panel)] border border-[var(--at-line)] hover:border-[var(--at-accent)]/50 overflow-hidden transition-colors flex flex-col group">
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="text-[var(--at-text)] font-bold text-lg tracking-tight break-words">
                          <Link to={`/project?projectId=${encodeURIComponent(project.id)}`} title="Workspace details" className="hover:text-[var(--at-link)] transition-colors">{project.name}</Link>
                        </h3>
                        {project.role === 'owner' && project.personalPublic && (
                          <button
                            onClick={() => setViewerProject({ id: project.id, name: project.name })}
                            className="text-[var(--at-muted)] hover:text-[var(--at-link)] transition-colors p-1 ml-auto"
                            title="Viewer settings"
                            aria-label={`Viewer settings of ${project.name}`}
                          >
                            <Eye size={16} />
                          </button>
                        )}
                        {project.role === 'owner' && project.personal && (
                          <button
                            onClick={() => setTransferProject({ id: project.id, name: project.name })}
                            className={`text-[var(--at-muted)] hover:text-[var(--at-link)] transition-colors p-1 ${project.personalPublic ? '' : 'ml-auto'}`}
                            title="Move into an organization"
                            aria-label={`Move ${project.name} into an organization`}
                          >
                            <Building2 size={16} />
                          </button>
                        )}
                        {project.role === 'owner' && (
                          <button
                            onClick={() => handleDeleteProject(project.id)}
                            className="text-[var(--at-muted)] hover:text-[var(--at-danger)] transition-colors p-1"
                            title="Delete workspace"
                            aria-label={`Delete ${project.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <p className="text-sm text-[var(--at-muted)]">
                        <span className="text-[var(--at-text)]">{STATUS_LABELS[project.status]}</span>
                        {' · '}{project.totalCommits == null ? 'not scanned' : `${project.totalCommits} commits`}
                        {!project.canMaintain && <span title="Only its maintainers can mine it or define its architecture with AI." className="ml-2 rounded-full border border-[var(--at-line)] px-2 py-0.5 text-[11px]">Read only</span>}
                      </p>
                      <p className="mt-3 mb-6 flex-1 text-xs leading-relaxed text-[var(--at-muted)] line-clamp-2">{step.hint}</p>

                      <div className="mt-auto flex gap-2">
                        {/* Opens the workspace's overview; the full-screen map is one click further (its Architecture tab). */}
                        <Link
                          to={`/project?projectId=${encodeURIComponent(project.id)}`}
                          aria-label={`Open ${project.name}`}
                          className="flex-1 h-10 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-semibold text-sm flex items-center justify-center gap-2"
                        >
                          Open <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                        {/* Scanning and mining are maintainer work; the server refuses them to members who only read. */}
                        {project.canMaintain && <button
                          type="button"
                          onClick={() => setMiningProject({ id: project.id, name: project.name })}
                          aria-label={`Manage mining of ${project.name}`}
                          className="h-10 px-4 rounded-full bg-[var(--at-panel-2)] hover:bg-[var(--at-line)] border border-[var(--at-line)] text-[var(--at-text)] text-sm flex items-center justify-center gap-2"
                        >
                          <Activity size={14} aria-hidden="true" /> Mining
                        </button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <PaginationBar {...pagination} />
          </>
        )}

        {/* BOTTOM PADDING */}
        <div className="h-10"></div>
        
      </div>

      {miningProject && <MiningPanel project={miningProject} open onClose={() => setMiningProject(null)} onChanged={fetchProjects} />}
      {viewerProject && <ViewerSettingsModal project={viewerProject} onClose={() => setViewerProject(null)} />}
      {transferProject && <TransferProjectModal project={transferProject} onClose={() => setTransferProject(null)} onMoved={() => { setTransferProject(null); fetchProjects(); }} />}

      {/* NEW PROJECT MODAL OVERLAY */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-[var(--at-page)]/80 backdrop-blur-sm"
            ></motion.div>

            {/* Modal Dialog */}
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-project-title"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-h-[90dvh] overflow-y-auto max-w-lg bg-[var(--at-panel)] border border-[var(--at-line)] shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-[var(--at-line)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--at-accent)] shadow-[0_0_5px_var(--at-glow)]"></div>
                  <h2 id="create-project-title" className="text-[var(--at-text)] font-bold tracking-tight uppercase text-sm font-mono tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Create Workspace</h2>
                </div>
                <button
                  onClick={closeModal}
                  aria-label="Close dialog"
                  className="text-[var(--at-muted)] hover:text-[var(--at-text)] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <p role="status" className="text-sm text-[var(--at-muted)]">
                  Connect a Git repository to analyze its architecture evolution. Public and private repositories are supported.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="project-name" className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Workspace Name</label>
                  <input
                    id="project-name"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Identity Service"
                    className="w-full h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] px-3 text-sm text-[var(--at-text)] placeholder:text-[var(--at-muted)] focus:outline-none focus:border-[var(--at-accent)]/50 focus:ring-1 focus:ring-[var(--at-accent)]/20 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="project-description" className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Description <span className="text-[var(--at-muted)]">(Optional)</span></label>
                  <textarea
                    id="project-description"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder="Brief architectural context..."
                    className="w-full h-20 bg-[var(--at-panel-2)] border border-[var(--at-line)] px-3 py-2 text-sm text-[var(--at-text)] placeholder:text-[var(--at-muted)] focus:outline-none focus:border-[var(--at-accent)]/50 focus:ring-1 focus:ring-[var(--at-accent)]/20 transition-[color,background-color,border-color,box-shadow,opacity,transform] resize-none"
                  ></textarea>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="project-space" className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Space</label>
                  <select
                    id="project-space"
                    value={organizationId}
                    onChange={(e) => chooseSpace(e.target.value)}
                    className="w-full h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] px-3 text-sm text-[var(--at-text)] focus:outline-none focus:border-[var(--at-accent)]/50 focus:ring-1 focus:ring-[var(--at-accent)]/20"
                  >
                    {workspaceSpaces(organizations ?? []).map(o => <option key={o.value} value={o.value} className="bg-[var(--at-panel-2)]">{o.label}</option>)}
                  </select>
                  <p className="text-[10px] text-[var(--at-muted)]">
                    {organizationId
                      ? 'Every owner of the organization maintains this workspace. Members see it once given a role.'
                      : 'Only you, and the people you invite, can open it.'}
                    {organizations && organizations.some(o => o.myRole === 'member') && ' Only owners can add workspaces to an organization.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository Provider</span>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-center gap-2 h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] cursor-pointer hover:border-[var(--at-muted)] transition-colors has-[:checked]:border-[var(--at-accent)] has-[:checked]:bg-[var(--at-accent)]/5 group">
                      <input type="radio" name="provider" className="sr-only" defaultChecked />
                      <Icon icon="mdi:github" width="18" height="18" className="text-[var(--at-text)] group-has-[:checked]:text-[var(--at-link)]" />
                      <span className="text-xs font-bold text-[var(--at-text)] group-has-[:checked]:text-[var(--at-link)]">GitHub</span>
                    </label>
                    <label className="flex items-center justify-center gap-2 h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] cursor-pointer hover:border-[var(--at-muted)] transition-colors has-[:checked]:border-[var(--at-accent)] has-[:checked]:bg-[var(--at-accent)]/5 group">
                      <input type="radio" name="provider" className="sr-only" />
                      <Icon icon="mdi:gitlab" width="18" height="18" className="text-[#FC6D26] group-has-[:checked]:text-[var(--at-link)]" />
                      <span className="text-xs font-bold text-[var(--at-text)] group-has-[:checked]:text-[var(--at-link)]">GitLab</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="repository-url" className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository URL</label>
                  <input
                    id="repository-url"
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/organization/repo"
                    className="w-full h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] px-3 text-sm font-mono text-[var(--at-text)] placeholder:text-[var(--at-muted)] focus:outline-none focus:border-[var(--at-accent)]/50 focus:ring-1 focus:ring-[var(--at-accent)]/20 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Visibility</span>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-center gap-2 h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] cursor-pointer hover:border-[var(--at-muted)] transition-colors has-[:checked]:border-[var(--at-accent)] has-[:checked]:bg-[var(--at-accent)]/5 group">
                      <input type="radio" name="visibility" value="public" className="sr-only" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
                      <Icon icon="mdi:earth" width="18" height="18" className="text-[var(--at-text)] group-has-[:checked]:text-[var(--at-link)]" />
                      <span className="text-xs font-bold text-[var(--at-text)] group-has-[:checked]:text-[var(--at-link)]">Public</span>
                    </label>
                    <label className="flex items-center justify-center gap-2 h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] cursor-pointer hover:border-[var(--at-muted)] transition-colors has-[:checked]:border-[var(--at-accent)] has-[:checked]:bg-[var(--at-accent)]/5 group">
                      <input type="radio" name="visibility" value="private" className="sr-only" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
                      <Icon icon="mdi:lock" width="18" height="18" className="text-[var(--at-text)] group-has-[:checked]:text-[var(--at-link)]" />
                      <span className="text-xs font-bold text-[var(--at-text)] group-has-[:checked]:text-[var(--at-link)]">Private</span>
                    </label>
                  </div>
                </div>

                {visibility === 'private' && organizationId && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider block"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Clone with</span>
                    {credentials === null ? (
                      <p className="text-xs text-[var(--at-muted)]">Loading the organization's credentials…</p>
                    ) : credentials.length ? (
                      <>
                        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Clone with">
                          {(['credential', 'token'] as const).map(kind => (
                            <label key={kind} className="flex items-center justify-center h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] cursor-pointer hover:border-[var(--at-muted)] transition-colors has-[:checked]:border-[var(--at-accent)] has-[:checked]:bg-[var(--at-accent)]/5">
                              <input type="radio" name="clone-with" className="sr-only" checked={access === kind} onChange={() => setAccess(kind)} />
                              <span className="text-xs font-bold text-[var(--at-text)]">{kind === 'credential' ? 'Organization credential' : 'Personal token'}</span>
                            </label>
                          ))}
                        </div>
                        {access === 'credential' && (
                          <select
                            aria-label="Organization credential"
                            value={credentialId}
                            onChange={(e) => setCredentialId(e.target.value)}
                            className="w-full h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] px-3 text-sm text-[var(--at-text)] focus:outline-none focus:border-[var(--at-accent)]/50"
                          >
                            {credentials.map(c => <option key={c.id} value={c.id} className="bg-[var(--at-panel-2)]">{c.name} (••••{c.last4})</option>)}
                          </select>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[var(--at-muted)]">
                        This organization has no credentials yet, so use a personal token below, or{' '}
                        <Link to={`/organizations/${encodeURIComponent(organizationId)}`} onClick={closeModal} className="text-[var(--at-link)] hover:underline">add one to the organization</Link>.
                      </p>
                    )}
                  </div>
                )}

                {visibility === 'private' && effectiveAccess === 'token' && (
                  <div className="space-y-1.5">
                    <label htmlFor="auth-token" className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider block"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Personal Access Token (PAT) / SSH Key</label>
                    <input
                      id="auth-token"
                      type="password"
                      placeholder="ghp_..."
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="w-full h-10 bg-[var(--at-panel-2)] border border-[var(--at-line)] px-3 text-sm font-mono text-[var(--at-text)] placeholder:text-[var(--at-muted)] focus:outline-none focus:border-[var(--at-accent)]/50 focus:ring-1 focus:ring-[var(--at-accent)]/20 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    />
                    <p className="text-[10px] text-[var(--at-muted)]">Required to authenticate and clone private repositories.</p>
                  </div>
                )}
              </div>

              <div className="p-6 pt-0">
                <button
                  onClick={handleConnect}
                  disabled={isSubmitting}
                  className="w-full h-10 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-bold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <FolderGit2 size={16} />}
                  CONNECT REPOSITORY
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </DashboardLayout>
  );
};

export default Projects;
