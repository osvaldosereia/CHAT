import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectDetail, type ProjectDetailData } from './components/ProjectDetail';
import {
  TemplateForm,
  type MugTemplateSettings,
} from './components/TemplateForm';
import { loadProjectList } from './lib/admin-data';
import { createSupabaseAdminStore } from './lib/supabase-admin-data';
import { ProjectsPage } from './pages/ProjectsPage';
import {
  loadProjectDetail,
  loadTemplateSettings,
  saveTemplateSettings,
} from './services/projects';
import { createSupabaseProjectDataPort } from './services/supabase-projects';
import type { ProjectListItem } from './components/ProjectList';

export type AdminSection = 'projects' | 'template';

export interface AdminWorkspaceViewProps {
  activeSection: AdminSection;
  projects: ProjectListItem[];
  selectedProjectId: string | null;
  projectDetail: ProjectDetailData | null;
  template: MugTemplateSettings | null;
  loading: boolean;
  error: string | null;
  templateMessage: string | null;
  onNavigate(section: AdminSection): void;
  onSelectProject(projectId: string): void;
  onSaveTemplate(template: MugTemplateSettings): void | Promise<void>;
  onSignOut(): void | Promise<void>;
}

export function AdminWorkspaceView({
  activeSection,
  projects,
  selectedProjectId,
  projectDetail,
  template,
  loading,
  error,
  templateMessage,
  onNavigate,
  onSelectProject,
  onSaveTemplate,
  onSignOut,
}: AdminWorkspaceViewProps) {
  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <strong>Caneca Fácil</strong>
          <span> Admin</span>
        </div>
        <nav aria-label="Navegação do Admin">
          <button
            type="button"
            aria-current={activeSection === 'projects' ? 'page' : undefined}
            onClick={() => onNavigate('projects')}
          >
            Projetos
          </button>
          <button
            type="button"
            aria-current={activeSection === 'template' ? 'page' : undefined}
            onClick={() => onNavigate('template')}
          >
            Gabarito
          </button>
          <button type="button" onClick={() => void onSignOut()}>
            Sair
          </button>
        </nav>
      </header>

      {error ? <p className="admin-alert" role="alert">{error}</p> : null}
      {loading ? <p className="admin-loading" aria-live="polite">Carregando…</p> : null}

      {activeSection === 'projects' ? (
        <div className="workspace-grid">
          <ProjectsPage
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelect={onSelectProject}
          />
          <aside className="workspace-detail" aria-label="Detalhe do projeto">
            {projectDetail ? (
              <ProjectDetail project={projectDetail} />
            ) : (
              <p className="empty-state">Selecione um projeto para ver os detalhes.</p>
            )}
          </aside>
        </div>
      ) : (
        <main className="admin-page admin-page--template">
          {template ? (
            <>
              <TemplateForm
                template={template}
                saving={loading}
                error={error}
                onSave={onSaveTemplate}
              />
              {templateMessage ? <p role="status">{templateMessage}</p> : null}
            </>
          ) : (
            <p className="empty-state">Nenhum gabarito ativo disponível.</p>
          )}
        </main>
      )}
    </div>
  );
}

export interface AdminWorkspaceProps {
  client: SupabaseClient;
}

export function AdminWorkspace({ client }: AdminWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>('projects');
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetailData | null>(null);
  const [template, setTemplate] = useState<MugTemplateSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);

  const listStore = useMemo(() => createSupabaseAdminStore(client), [client]);
  const projectPort = useMemo(() => createSupabaseProjectDataPort(client), [client]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadProjectList(listStore)
      .then((items) => {
        if (active) setProjects(items);
      })
      .catch(() => {
        if (active) {
          setError('Não foi possível carregar os projetos. Confirme se este usuário é administrador.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listStore]);

  async function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setLoading(true);
    setError(null);
    setTemplateMessage(null);

    try {
      const detail = await loadProjectDetail(projectPort, projectId);
      setProjectDetail(detail);
    } catch {
      setProjectDetail(null);
      setError('Não foi possível carregar o detalhe do projeto.');
    } finally {
      setLoading(false);
    }
  }

  async function handleNavigate(section: AdminSection) {
    setActiveSection(section);
    setError(null);
    setTemplateMessage(null);

    if (section === 'template' && !template) {
      setLoading(true);
      try {
        setTemplate(await loadTemplateSettings(projectPort));
      } catch {
        setError('Não foi possível carregar o gabarito.');
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleSaveTemplate(nextTemplate: MugTemplateSettings) {
    setLoading(true);
    setError(null);
    setTemplateMessage(null);

    try {
      await saveTemplateSettings(projectPort, nextTemplate);
      setTemplate(nextTemplate);
      setTemplateMessage('Gabarito salvo.');
    } catch {
      setError('Não foi possível salvar o gabarito.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) {
      setError('Não foi possível sair do Admin.');
    }
  }

  return (
    <AdminWorkspaceView
      activeSection={activeSection}
      projects={projects}
      selectedProjectId={selectedProjectId}
      projectDetail={projectDetail}
      template={template}
      loading={loading}
      error={error}
      templateMessage={templateMessage}
      onNavigate={handleNavigate}
      onSelectProject={handleSelectProject}
      onSaveTemplate={handleSaveTemplate}
      onSignOut={handleSignOut}
    />
  );
}
