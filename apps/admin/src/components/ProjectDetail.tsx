export interface ProjectBriefingSummary {
  version: number;
  mainTheme: string | null;
  mandatoryText: string[];
  readyToGenerate: boolean;
}

export interface ProjectDetailData {
  id: string;
  title: string | null;
  status: string;
  creationMode: 'reference' | 'from_scratch';
  customerName: string | null;
  customerPhone: string | null;
  briefing: ProjectBriefingSummary | null;
  mediaCount: number;
  artVersion: number | null;
  artUrl: string | null;
  mockupVersion: number | null;
  mockupUrl: string | null;
  latestReview: string | null;
}

export function ProjectDetail({ project }: { project: ProjectDetailData }) {
  return (
    <article className="project-detail">
      <header className="project-detail__header">
        <div>
          <p className="eyebrow">Projeto</p>
          <h2>{project.title || 'Caneca sem título'}</h2>
        </div>
        <span className="status-chip">{project.status}</span>
      </header>

      <section>
        <h3>Cliente</h3>
        <p>{project.customerName || 'Nome ainda não informado'}</p>
        <small>{project.customerPhone || 'Telefone indisponível'}</small>
      </section>

      <section>
        <h3>Briefing</h3>
        {project.briefing ? (
          <div>
            <p>Versão {project.briefing.version}</p>
            <p>{project.briefing.mainTheme || 'Tema ainda não definido'}</p>
            {project.briefing.mandatoryText.length > 0 ? (
              <ul>
                {project.briefing.mandatoryText.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            ) : (
              <p>Sem texto obrigatório.</p>
            )}
          </div>
        ) : (
          <p>Briefing ainda não criado.</p>
        )}
      </section>

      <section>
        <h3>Referências</h3>
        <p>{project.mediaCount} arquivo(s) recebido(s).</p>
      </section>

      <section>
        <h3>Arte horizontal</h3>
        {project.artUrl ? (
          <figure>
            <img src={project.artUrl} alt="Arte horizontal atual da caneca" />
            <figcaption>Versão {project.artVersion}</figcaption>
          </figure>
        ) : (
          <p>Arte ainda não gerada.</p>
        )}
      </section>

      <section>
        <h3>Mockup</h3>
        {project.mockupUrl ? (
          <figure>
            <img src={project.mockupUrl} alt="Mockup atual mostrando os dois lados da caneca" />
            <figcaption>Versão {project.mockupVersion}</figcaption>
          </figure>
        ) : (
          <p>Mockup ainda não gerado.</p>
        )}
      </section>

      <section>
        <h3>Revisão</h3>
        <p>{project.latestReview || 'Sem evento de revisão ainda.'}</p>
      </section>
    </article>
  );
}
