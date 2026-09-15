import { ProjectList, type ProjectListItem } from '../components/ProjectList';

export interface ProjectsPageProps {
  projects: ProjectListItem[];
  selectedProjectId: string | null;
  onSelect(projectId: string): void;
}

export function ProjectsPage({ projects, selectedProjectId, onSelect }: ProjectsPageProps) {
  return (
    <main className="admin-page admin-page--projects">
      <header className="admin-page__header">
        <div>
          <p className="eyebrow">Caneca Fácil</p>
          <h1>Projetos</h1>
        </div>
      </header>

      <ProjectList
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelect={onSelect}
      />
    </main>
  );
}
