"use client";

import { useEffect, useRef, useState } from "react";
import { OPENNESS_TEXT, type GalleryContent, type Locale, type Project } from "@/content";
import { UI } from "@/lib/i18n";
import { artworkUrl, roomFor } from "@/lib/artworks";
import { CollectButton } from "./CollectButton";

export function ExhibitArt({ project, content, title }: { project: Project; content: GalleryContent; title: string }) {
  const room = roomFor(content, project);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    artworkUrl(project, room).then((u) => alive && setSrc(u)).catch(() => {});
    return () => { alive = false; };
  }, [project, room]);
  return (
    <div
      className="exhibit-art"
      style={{ background: `linear-gradient(160deg, ${room.palette.fog}, ${room.palette.wall} 60%, ${room.palette.accent})` }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} width={768} height={576} />
      )}
    </div>
  );
}

export function ExhibitView({
  project, content, locale, onBack, onVisitRoom, headingRef,
}: {
  project: Project;
  content: GalleryContent;
  locale: Locale;
  onBack: () => void;
  onVisitRoom?: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const ui = UI[locale];
  const t = project.t[locale] ?? project.t.en;
  const room = roomFor(content, project);
  const open = OPENNESS_TEXT[project.openness][locale];
  const sourceLabel =
    project.category === "AM" ? ui.getWeights : project.openness === "openStandard" ? ui.viewStandard : ui.viewSource;
  const localRef = useRef<HTMLHeadingElement>(null);

  return (
    <article className="exhibit" style={{ ["--accent" as string]: room.palette.accent }}>
      <div className="exhibit-top">
        <button type="button" className="btn btn-quiet" onClick={onBack}>
          <span aria-hidden="true" className="flip-rtl">←</span> {ui.backToGallery}
          <span className="kbd esc-kbd" aria-hidden="true">Esc</span>
        </button>
        <p className="exhibit-room">
          {ui.foundIn}{" "}
          {onVisitRoom ? (
            <button type="button" className="link" onClick={onVisitRoom}>{room.t[locale].title}</button>
          ) : (
            <span>{room.t[locale].title}</span>
          )}
        </p>
      </div>
      <div className="exhibit-grid">
        <ExhibitArt project={project} content={content} title={project.title} />
        <div className="exhibit-text">
          {project.openingOrder && <p className="eyebrow">{ui.openingCollection}</p>}
          {project.comingSoon && <p className="placard-soon">{ui.comingSoon}</p>}
          <h1 ref={headingRef ?? localRef} tabIndex={-1} className="exhibit-title">
            <bdi>{project.title}</bdi>
          </h1>
          <p className="exhibit-line">{t.oneLine}</p>
          {t.why && (
            <section>
              <h2>{ui.whyItMatters}</h2>
              <p>{t.why}</p>
            </section>
          )}
          <section>
            <h2>{ui.openness}</h2>
            <p><span className="badge">{open.label}</span> {open.explain}</p>
          </section>
          {t.caution && (
            <section className="caution">
              <h2>{ui.goodToKnow}</h2>
              <p>{t.caution}</p>
            </section>
          )}
          {t.installation && (
            <section>
              <h2>{ui.inTheGallery}</h2>
              <p>{t.installation}</p>
            </section>
          )}
          <div className="exhibit-links">
            <CollectButton slug={project.slug} locale={locale} />
            {project.site && (
              <a className="btn btn-primary" href={project.site} target="_blank" rel="noopener noreferrer">
                {ui.visitWebsite} <span aria-hidden="true">↗</span>
              </a>
            )}
            {project.source && project.source !== project.site && (
              <a className="btn" href={project.source} target="_blank" rel="noopener noreferrer">
                {sourceLabel} <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
