import { readTokens } from '@/auth/session';
import React, { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '@/auth/session';
import { App } from 'antd';
import { motion, AnimatePresence } from 'motion/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  FolderKanban,
  Activity,
  Plus,
  ArrowRight,
  GitCommit,
  X,
  FolderGit2,
  Loader2,
  Trash2
} from 'lucide-react';
import { Icon } from '@iconify/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import MiningPanel from '@/components/MiningPanel';
import { Link } from 'react-router-dom';
import { byRecent, getWorkspaces, hasMinedHistory, nextStep, STATUS_LABELS, type Workspace } from '@/features/workspace-summary';

const Projects: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const closeModal = useCallback(() => setIsModalOpen(false), []);
  const [miningProject, setMiningProject] = useState<{ id: string; name: string } | null>(null);
  const modalRef = useFocusTrap(isModalOpen, closeModal);
  const { message } = App.useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [token, setToken] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');

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
    if (!projectName.trim() || !repoUrl.trim()) {
      message.error('Workspace Name and Repository URL are required.');
      return;
    }
    if (visibility === 'private' && !token.trim()) {
      message.error('Personal Access Token or SSH Key is required for private repositories.');
      return;
    }
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${readTokens().accessToken}`
        },
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
          repoUrl,
          visibility,
          token
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const projectId = data.data.project.id;
        
        // Only read the commit history here; the user chooses what to mine (a date range or everything).
        await fetch(`${API_BASE_URL}/projects/${projectId}/scan`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${readTokens().accessToken}` }
        });

        message.success('Repository registered. Choose which part of its history to mine.');
        setMiningProject({ id: projectId, name: data.data.project.name ?? projectName });
        fetchProjects();
        closeModal();
        setVisibility('public');
        setToken('');
        setProjectName('');
        setProjectDescription('');
        setRepoUrl('');
      } else {
        const err = await response.json().catch(() => ({}));
        message.error(err.message || 'Failed to register repository');
      }
    } catch (error) {
      message.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${readTokens().accessToken}`
        }
      });
      if (response.ok) {
        message.success('Workspace deleted successfully');
        setProjectsList(prev => prev?.filter(p => p.id !== id) ?? prev);
        fetchProjects();
      } else {
        const err = await response.json().catch(() => ({}));
        message.error(err.message || 'Failed to delete workspace');
      }
    } catch (error) {
      message.error('Network error. Please try again.');
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161d24] border border-[#242527] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shadow-[0_0_5px_#3b82f6]"></div>
            <span className="text-[10px] font-mono text-[#3b82f6] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository Workspace</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Repository Workspaces</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Manage repositories and their architecture analysis. Each workspace contains one or more connected repositories.
              </p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="shrink-0 h-10 px-5 bg-[#3b82f6] hover:bg-[#3b82f6]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.15)]"
            >
              <Plus size={16} />
              NEW WORKSPACE
            </button>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#242527] to-transparent mt-8"></div>
        </div>

        {loadError && (
          <div role="alert" className="border border-[#ef4444]/40 bg-[#ef4444]/5 p-4 text-sm text-[#fca5a5] flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <button type="button" onClick={fetchProjects} className="h-8 px-3 border border-[#ef4444]/40 text-xs font-semibold">Try again</button>
          </div>
        )}

        {projectsList === null ? (
          !loadError && <div className="flex items-center justify-center p-12"><Loader2 size={24} className="animate-spin text-[#3b82f6]" aria-label="Loading workspaces" /></div>
        ) : projectsList.length === 0 ? (
          <section aria-labelledby="first-workspace-title" className="bg-[#11161b] border border-dashed border-[#242527] p-10 text-center">
            <FolderGit2 size={28} className="text-[#3b82f6] mx-auto mb-4" aria-hidden="true" />
            <h3 id="first-workspace-title" className="text-lg font-bold text-[#f4f4f6] mb-2">Create your first workspace</h3>
            <p className="text-sm text-[#94a3b8] max-w-md mx-auto mb-6">A workspace connects one Git repository. After creating it you scan its history, mine commits and group files into components.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => setIsModalOpen(true)} className="h-10 px-5 bg-[#3b82f6] hover:bg-[#60a5fa] text-[#080b0e] font-bold text-xs flex items-center gap-2">
                <Plus size={16} aria-hidden="true" /> New workspace
              </button>
              <Link to="/workspace/sample/shophub" className="h-10 px-5 bg-[#161d24] hover:bg-[#242527] border border-[#242527] text-[#f4f4f6] text-xs font-medium flex items-center">
                Explore a sample workspace
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* PROJECT SUMMARY METRICS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: FolderKanban, label: 'Workspaces', value: projectsList.length, color: 'text-[#94a3b8]' },
                { icon: GitCommit, label: 'Commits found', value: projectsList.reduce((sum, p) => sum + (p.totalCommits ?? 0), 0), color: 'text-[#3b82f6]' },
                { icon: Activity, label: 'Mined workspaces', value: projectsList.filter(hasMinedHistory).length, color: 'text-[#ffb03a]' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center gap-4 bg-[#161d24] border border-[#242527] p-5">
                  <div className="w-12 h-12 bg-[#080b0e] border border-[#242527] flex items-center justify-center">
                    <Icon size={20} className={color} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-[10px] font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mb-1" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{label}</h3>
                    <div className="text-2xl font-bold text-[#f4f4f6] font-mono" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* PROJECT LIST */}
            <input aria-label="Search workspaces" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search workspaces…" className="h-11 w-full max-w-md px-4 border border-[#242527] bg-[#11161b] text-sm" />
            {!filteredProjects.length && <p role="status" className="text-[#94a3b8] text-sm">No workspaces match your search.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pagination.items.map((project) => {
                const step = nextStep(project);
                return (
                  <div key={project.id} className="bg-[#11161b] border border-[#242527] hover:border-[#3b82f6]/50 overflow-hidden transition-colors flex flex-col group">
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="text-[#f4f4f6] font-bold text-lg tracking-tight group-hover:text-[#3b82f6] transition-colors break-words">{project.name}</h3>
                        {project.role === 'owner' && (
                          <button
                            onClick={() => handleDeleteProject(project.id)}
                            className="text-[#94a3b8] hover:text-[#ef4444] transition-colors p-1"
                            title="Delete workspace"
                            aria-label={`Delete ${project.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <p className="text-[#94a3b8] text-sm mb-6 line-clamp-2 leading-relaxed flex-1 break-all">
                        {project.description || project.repoUrl || 'No description.'}
                      </p>

                      <dl className="grid grid-cols-2 gap-y-4 gap-x-2 mb-6">
                        <div>
                          <dt className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider mb-1" style={{ fontFamily: '"JetBrains Mono", monospace' }}>Status</dt>
                          <dd className="text-[#f4f4f6] text-sm font-mono" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{STATUS_LABELS[project.status]}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider mb-1" style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commits found</dt>
                          <dd className="text-[#f4f4f6] text-sm font-mono" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{project.totalCommits ?? 'Not scanned'}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider mb-1" style={{ fontFamily: '"JetBrains Mono", monospace' }}>Next step</dt>
                          <dd className="text-[#94a3b8] text-xs leading-relaxed">{step.hint}</dd>
                        </div>
                      </dl>

                      <button
                        type="button"
                        onClick={() => setMiningProject({ id: project.id, name: project.name })}
                        className="w-full h-11 mb-3 bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#3b82f6] text-xs font-bold flex items-center justify-center gap-2"
                      >
                        MANAGE MINING
                      </button>
                      <div className="mt-auto flex gap-2">
                        <Link
                          to={`/workspace/${encodeURIComponent(project.id)}`}
                          className="flex-1 h-11 bg-[#3b82f6] hover:bg-[#60a5fa] text-[#080b0e] font-semibold text-sm flex items-center justify-center gap-2"
                        >
                          Open architecture <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                        <Link
                          to={`/project?projectId=${encodeURIComponent(project.id)}`}
                          aria-label={`Details of ${project.name}`}
                          title="Workspace details"
                          className="h-11 px-3 bg-[#161d24] hover:bg-[#242527] border border-[#242527] text-xs flex items-center justify-center"
                        >
                          Details
                        </Link>
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
              className="absolute inset-0 bg-[#080b0e]/80 backdrop-blur-sm"
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
              className="relative w-full max-h-[90dvh] overflow-y-auto max-w-lg bg-[#11161b] border border-[#242527] shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-[#242527] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shadow-[0_0_5px_#3b82f6]"></div>
                  <h2 id="create-project-title" className="text-[#f4f4f6] font-bold tracking-tight uppercase text-sm font-mono tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Create Workspace</h2>
                </div>
                <button
                  onClick={closeModal}
                  aria-label="Close dialog"
                  className="text-[#94a3b8] hover:text-[#f4f4f6] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <p role="status" className="text-sm text-[#94a3b8]">
                  Connect a Git repository to analyze its architecture evolution. Public and private repositories are supported.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="project-name" className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Workspace Name</label>
                  <input
                    id="project-name"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Identity Service"
                    className="w-full h-10 bg-[#161d24] border border-[#242527] px-3 text-sm text-[#f4f4f6] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/20 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="project-description" className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Description <span className="text-[#94a3b8]">(Optional)</span></label>
                  <textarea
                    id="project-description"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder="Brief architectural context..."
                    className="w-full h-20 bg-[#161d24] border border-[#242527] px-3 py-2 text-sm text-[#f4f4f6] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/20 transition-[color,background-color,border-color,box-shadow,opacity,transform] resize-none"
                  ></textarea>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository Provider</span>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-center gap-2 h-10 bg-[#161d24] border border-[#242527] cursor-pointer hover:border-[#94a3b8] transition-colors has-[:checked]:border-[#3b82f6] has-[:checked]:bg-[#3b82f6]/5 group">
                      <input type="radio" name="provider" className="sr-only" defaultChecked />
                      <Icon icon="mdi:github" width="18" height="18" className="text-[#f4f4f6] group-has-[:checked]:text-[#3b82f6]" />
                      <span className="text-xs font-bold text-[#f4f4f6] group-has-[:checked]:text-[#3b82f6]">GitHub</span>
                    </label>
                    <label className="flex items-center justify-center gap-2 h-10 bg-[#161d24] border border-[#242527] cursor-pointer hover:border-[#94a3b8] transition-colors has-[:checked]:border-[#3b82f6] has-[:checked]:bg-[#3b82f6]/5 group">
                      <input type="radio" name="provider" className="sr-only" />
                      <Icon icon="mdi:gitlab" width="18" height="18" className="text-[#FC6D26] group-has-[:checked]:text-[#3b82f6]" />
                      <span className="text-xs font-bold text-[#f4f4f6] group-has-[:checked]:text-[#3b82f6]">GitLab</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="repository-url" className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository URL</label>
                  <input
                    id="repository-url"
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/organization/repo"
                    className="w-full h-10 bg-[#161d24] border border-[#242527] px-3 text-sm font-mono text-[#f4f4f6] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/20 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Visibility</span>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-center gap-2 h-10 bg-[#161d24] border border-[#242527] cursor-pointer hover:border-[#94a3b8] transition-colors has-[:checked]:border-[#3b82f6] has-[:checked]:bg-[#3b82f6]/5 group">
                      <input type="radio" name="visibility" value="public" className="sr-only" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
                      <Icon icon="mdi:earth" width="18" height="18" className="text-[#f4f4f6] group-has-[:checked]:text-[#3b82f6]" />
                      <span className="text-xs font-bold text-[#f4f4f6] group-has-[:checked]:text-[#3b82f6]">Public</span>
                    </label>
                    <label className="flex items-center justify-center gap-2 h-10 bg-[#161d24] border border-[#242527] cursor-pointer hover:border-[#94a3b8] transition-colors has-[:checked]:border-[#3b82f6] has-[:checked]:bg-[#3b82f6]/5 group">
                      <input type="radio" name="visibility" value="private" className="sr-only" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
                      <Icon icon="mdi:lock" width="18" height="18" className="text-[#f4f4f6] group-has-[:checked]:text-[#3b82f6]" />
                      <span className="text-xs font-bold text-[#f4f4f6] group-has-[:checked]:text-[#3b82f6]">Private</span>
                    </label>
                  </div>
                </div>

                {visibility === 'private' && (
                  <div className="space-y-1.5">
                    <label htmlFor="auth-token" className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Personal Access Token (PAT) / SSH Key</label>
                    <input
                      id="auth-token"
                      type="password"
                      placeholder="ghp_..."
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="w-full h-10 bg-[#161d24] border border-[#242527] px-3 text-sm font-mono text-[#f4f4f6] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/20 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    />
                    <p className="text-[10px] text-[#94a3b8]">Required to authenticate and clone private repositories.</p>
                  </div>
                )}
              </div>

              <div className="p-6 pt-0">
                <button
                  onClick={handleConnect}
                  disabled={isSubmitting}
                  className="w-full h-10 bg-[#3b82f6] hover:bg-[#3b82f6]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.15)] disabled:opacity-70"
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
