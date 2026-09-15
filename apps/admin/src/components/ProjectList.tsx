export interface ProjectListItem {
  id: string;
  title: string | null;
  customerName: string | null;
  status: string;
  createdAt: string;
}

export interface ProjectListProps {
  projects: ProjectListItem[];
  selectedProjectId: string | null;
  onSelect(projectId: string): void;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Novo',
  collecting_references: 'Coletando referências',
  building_briefing: 'Montando briefing',
  waiting_customer: 'Aguardando cliente',
  ready_to_generate: 'Pronto para gerar',
  generating_art: 'Gerando arte',
  validating_art: 'Validando arte',
  generating_mockup: 'Gerando mockup',
  waiting_approval: 'Aguardando aprovação',
  change_requested: 'Alteração solicitada',
  needs_review: 'Revisão interna',
  approved: 'Aprovado',
  failed: 'Falhou',
};

function formatProjectDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Data indisponível';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function ProjectList({ projects, selectedProjectId, onSelect }: ProjectListProps) {
  return (
    <section aria-labelledby="projects-title" className="project-list">
      <header>
        <p className="eyebrow">Atendimento</p>
        <h2 id="projects-title">Projetos</h2>
      </header>

      {projects.length === 0 ? (
        <p className="empty-state">Nenhum projeto ainda.</p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                aria-pressed={selectedProjectId === project.id}
                onClick={() => onSelect(project.id)}
              >
                <strong>{project.title || 'Caneca sem título'}</strong>
                <span>{project.customerName || 'Cliente sem nome'}</span>
                <small>{STATUS_LABELS[project.status] ?? project.status}</small>
                <time dateTime={project.createdAt}>{formatProjectDate(project.createdAt)}</time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
