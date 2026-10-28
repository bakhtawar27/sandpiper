import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import {
  isSupportedCodebookFile,
  MAX_CODEBOOK_FILE_BYTES,
  SUPPORTED_CODEBOOK_EXTENSIONS,
} from "../helpers/codebookFileTypes";

const ImportCodebookDialog = ({
  onImportCodebookClicked,
}: {
  onImportCodebookClicked: ({
    file,
    name,
  }: {
    file: File;
    name: string;
  }) => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");

  const fileError = !file
    ? null
    : !isSupportedCodebookFile(file.name)
      ? `Use one of: ${SUPPORTED_CODEBOOK_EXTENSIONS.join(", ")}`
      : file.size > MAX_CODEBOOK_FILE_BYTES
        ? "File is larger than 10 MB"
        : null;

  const isSubmitButtonDisabled = !file || !!fileError;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Import a codebook from a file</DialogTitle>
        <DialogDescription>
          Upload your codebook document. Sandpiper reads it and creates the
          categories, codes, definitions and examples for you. Review them in
          the editor before generating a prompt.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <Label htmlFor="codebook-file">Codebook file</Label>
        <Input
          id="codebook-file"
          name="codebookFile"
          type="file"
          accept={SUPPORTED_CODEBOOK_EXTENSIONS.join(",")}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {fileError && <p className="text-destructive text-sm">{fileError}</p>}
        <div>
          <Label htmlFor="codebook-name">Name (optional)</Label>
          <p className="text-muted-foreground text-body">
            Leave empty to use the name found in the document.
          </p>
        </div>
        <Input
          id="codebook-name"
          name="codebookName"
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <DialogFooter className="justify-end">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </DialogClose>
        <DialogClose asChild>
          <Button
            type="button"
            disabled={isSubmitButtonDisabled}
            onClick={() => {
              if (file) onImportCodebookClicked({ file, name });
            }}
          >
            Import codebook
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
};

export default ImportCodebookDialog;
