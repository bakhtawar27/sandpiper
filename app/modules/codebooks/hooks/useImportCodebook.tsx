import { useEffect, useRef } from "react";
import { useFetcher, useNavigate } from "react-router";
import { toast } from "sonner";
import addDialog from "~/modules/dialogs/addDialog";
import ImportCodebookDialog from "../components/importCodebookDialog";

export function useImportCodebook({ teamId }: { teamId: string }) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const toastId = useRef<string | number | null>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (toastId.current) {
      toast.dismiss(toastId.current);
      toastId.current = null;
    }

    if (fetcher.data.intent === "IMPORT_CODEBOOK") {
      const { categoryCount, codeCount, url } = fetcher.data.data;
      toast.success(
        `Codebook imported: ${categoryCount} categories, ${codeCount} codes. Please review them.`,
      );
      navigate(url);
    } else if (fetcher.data.errors) {
      const errors = fetcher.data.errors as Record<string, string>;
      toast.error(
        errors.codebook || errors.general || "Failed to import codebook",
      );
    }
  }, [fetcher.state, fetcher.data, navigate]);

  const submitImport = ({ file, name }: { file: File; name: string }) => {
    const formData = new FormData();
    formData.append("intent", "IMPORT_CODEBOOK");
    formData.append("teamId", teamId);
    formData.append("codebookName", name);
    formData.append("codebookFile", file);

    toastId.current = toast.loading(
      "Reading your codebook. This can take a minute...",
    );

    fetcher.submit(formData, {
      method: "POST",
      encType: "multipart/form-data",
      action: "/api/annotatorAgent",
    });
  };

  const openImportCodebookDialog = () => {
    addDialog(<ImportCodebookDialog onImportCodebookClicked={submitImport} />);
  };

  return {
    openImportCodebookDialog,
    isImporting: fetcher.state !== "idle",
  };
}
