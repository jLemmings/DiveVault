<script>
import { PDF_PREVIEW_SCALE } from "../utils/settings-profile.js";

let pdfJsPromise = null;

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ]).then(([pdfJs, workerUrl]) => {
      pdfJs.GlobalWorkerOptions.workerSrc = workerUrl.default || workerUrl;
      return pdfJs;
    });
  }
  return pdfJsPromise;
}

export default {
  name: "LicensePdfPreview",
  emits: ["open-preview"],
  props: {
    pdf: {
      type: Object,
      default: null
    },
    authenticatedFetch: {
      type: Function,
      required: true
    }
  },
  data() {
    return {
      loading: false,
      error: "",
      pages: []
    };
  },
  watch: {
    "pdf.preview_url": {
      handler() {
        this.loadPreview();
      },
      immediate: true
    }
  },
  methods: {
    async loadPreview() {
      if (!this.pdf?.preview_url) {
        this.pages = [];
        this.error = "";
        this.loading = false;
        return;
      }

      this.loading = true;
      this.error = "";
      this.pages = [];

      try {
        const { getDocument } = await loadPdfJs();
        const response = await this.authenticatedFetch(this.pdf.preview_url);
        if (!response.ok) {
          throw new Error(`Preview request failed with ${response.status}`);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdfDocument = await getDocument({ data: bytes }).promise;
        const pages = [];

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber);
          const viewport = page.getViewport({ scale: PDF_PREVIEW_SCALE });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas rendering is unavailable in this browser");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          pages.push({
            pageNumber,
            image: canvas.toDataURL("image/png")
          });
        }

        this.pages = pages;
      } catch (error) {
        this.error = error?.message || "Could not render the PDF preview.";
      } finally {
        this.loading = false;
      }
    }
  },
}
</script>

<template>
    <div>
      <div v-if="loading" class="rounded border border-primary/10 bg-surface-container-lowest px-4 py-4 text-sm text-secondary">
        Rendering PDF preview...
      </div>
      <div v-else-if="error" class="rounded border border-error/20 bg-error-container/20 px-4 py-4 text-sm text-on-error-container">
        {{ error }}
      </div>
      <div v-else class="space-y-3">
        <button
          v-for="page in pages"
          :key="page.pageNumber"
          type="button"
          @click="$emit('open-preview', page)"
          class="block w-full overflow-hidden border border-primary/10 bg-white transition-transform hover:scale-[1.01]"
        >
          <img
            :src="page.image"
            :alt="`License PDF page ${page.pageNumber}`"
            class="w-full cursor-zoom-in"
          />
        </button>
      </div>
    </div>
</template>
