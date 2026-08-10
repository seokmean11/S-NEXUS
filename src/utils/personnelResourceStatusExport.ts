const PDF_MARGIN_PT = 8;
const EXPORT_WRAPPER_CLASS = 'personnel-resource-status-export-wrapper';

async function waitForNextPaint() {
  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function getFilenameBase(): string {
  return `자원정보현황_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
}

function measureElementContentSize(element: HTMLElement): { width: number; height: number } {
  const rootRect = element.getBoundingClientRect();
  let maxBottom = rootRect.bottom;
  let maxRight = rootRect.right;

  element.querySelectorAll('*').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return;
    maxBottom = Math.max(maxBottom, rect.bottom);
    maxRight = Math.max(maxRight, rect.right);
  });

  return {
    width: Math.max(
      Math.ceil(maxRight - rootRect.left),
      element.scrollWidth,
      element.offsetWidth,
      1,
    ),
    height: Math.max(
      Math.ceil(maxBottom - rootRect.top),
      element.scrollHeight,
      element.offsetHeight,
      1,
    ),
  };
}

function createExportClone(root: HTMLElement): {
  wrapper: HTMLDivElement;
  clone: HTMLElement;
  captureWidth: number;
} {
  const captureWidth = Math.max(Math.round(root.getBoundingClientRect().width), root.offsetWidth, 1);
  const wrapper = document.createElement('div');
  wrapper.className = EXPORT_WRAPPER_CLASS;
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-20000px';
  wrapper.style.top = '0';
  wrapper.style.width = `${captureWidth}px`;
  wrapper.style.background = '#ffffff';
  wrapper.style.overflow = 'visible';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.zIndex = '-1';

  const clone = root.cloneNode(true) as HTMLElement;
  clone.classList.add('personnel-resource-status-export-capture');
  clone.style.width = `${captureWidth}px`;
  clone.style.maxWidth = `${captureWidth}px`;
  clone.style.overflow = 'visible';
  clone.style.height = 'auto';
  clone.style.maxHeight = 'none';

  clone.querySelectorAll('.personnel-resource-status-export-hide').forEach((node) => {
    node.remove();
  });

  clone.querySelectorAll('.card, .card__body').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.overflow = 'visible';
    node.style.maxHeight = 'none';
    node.style.height = 'auto';
  });

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return { wrapper, clone, captureWidth };
}

function pickBestA4Layout(canvas: HTMLCanvasElement, margin: number) {
  const layouts = [
    { orientation: 'portrait' as const, width: 595.28, height: 841.89 },
    { orientation: 'landscape' as const, width: 841.89, height: 595.28 },
  ];

  let best = layouts[0];
  let bestScale = 0;

  for (const layout of layouts) {
    const scale = Math.min(
      (layout.width - margin * 2) / canvas.width,
      (layout.height - margin * 2) / canvas.height,
    );
    if (scale > bestScale) {
      bestScale = scale;
      best = layout;
    }
  }

  return best.orientation;
}

function addCanvasToPdfFitSinglePage(pdf: import('jspdf').jsPDF, canvas: HTMLCanvasElement, margin: number) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  const renderWidth = canvas.width * scale;
  const renderHeight = canvas.height * scale;
  const offsetX = (pageWidth - renderWidth) / 2;
  const offsetY = (pageHeight - renderHeight) / 2;

  pdf.addImage(
    canvas.toDataURL('image/jpeg', 0.95),
    'JPEG',
    offsetX,
    offsetY,
    renderWidth,
    renderHeight,
  );
}

async function downloadResourceStatusPdf(root: HTMLElement, filenameBase: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const { wrapper, clone } = createExportClone(root);

  try {
    await waitForNextPaint();
    await waitForNextPaint();

    const { height } = measureElementContentSize(clone);
    wrapper.style.height = `${height}px`;
    clone.style.minHeight = `${height}px`;

    await waitForNextPaint();

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (documentClone: Document) => {
        const clonedRoot = documentClone.querySelector(
          `.${EXPORT_WRAPPER_CLASS} .personnel-resource-status-export-capture`,
        ) as HTMLElement | null;
        if (!clonedRoot) return;

        clonedRoot.style.overflow = 'visible';
        clonedRoot.style.maxHeight = 'none';
        clonedRoot.style.height = 'auto';

        clonedRoot.querySelectorAll('.card, .card__body').forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.style.overflow = 'visible';
          node.style.maxHeight = 'none';
          node.style.height = 'auto';
        });

        documentClone.querySelectorAll('.personnel-resource-status__division-charts').forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.style.overflow = 'visible';
        });
      },
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('대시보드 이미지를 생성하지 못했습니다.');
    }

    const orientation = pickBestA4Layout(canvas, PDF_MARGIN_PT);
    const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
    addCanvasToPdfFitSinglePage(pdf, canvas, PDF_MARGIN_PT);
    pdf.save(`${filenameBase}.pdf`);
  } finally {
    wrapper.remove();
  }
}

export async function exportPersonnelResourceStatusPdf(root: HTMLElement): Promise<void> {
  await downloadResourceStatusPdf(root, getFilenameBase());
}
