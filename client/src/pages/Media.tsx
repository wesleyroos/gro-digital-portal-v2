import { trpc } from "@/lib/trpc";
import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Trash2, Copy, Check, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Media() {
  const utils = trpc.useUtils();
  const { data: files = [], isLoading } = trpc.media.list.useQuery();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.media.upload.useMutation({
    onSuccess: () => utils.media.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => utils.media.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  async function uploadFiles(fileList: FileList) {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
    const toUpload = Array.from(fileList).filter(f => allowed.includes(f.type));
    if (toUpload.length === 0) { toast.error("Only image files are supported"); return; }

    setUploading(true);
    let count = 0;
    for (const file of toUpload) {
      try {
        const base64 = await fileToBase64(file);
        await uploadMutation.mutateAsync({ name: file.name, base64, mimeType: file.type, size: file.size });
        count++;
      } catch { /* error shown by mutation */ }
    }
    setUploading(false);
    if (count > 0) toast.success(`${count} file${count > 1 ? 's' : ''} uploaded`);
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) await uploadFiles(e.dataTransfer.files);
  }, []);

  function copyUrl(id: number, url: string) {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("URL copied");
  }

  const filtered = search
    ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : files;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload images and copy URLs for use in campaigns and mailers.</p>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="shrink-0">
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 py-10 cursor-pointer transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30"
        }`}
      >
        <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Drop images here or click to browse</p>
        <p className="text-xs text-muted-foreground/60">PNG, JPG, GIF, WebP, SVG</p>
      </div>

      {files.length > 5 && (
        <Input
          placeholder="Search by filename…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-8"
        />
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          {search ? "No files match your search." : "No files uploaded yet."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map(file => (
            <div key={file.id} className="group relative border rounded-lg overflow-hidden bg-muted/20 hover:bg-muted/40 transition-colors">
              {/* Thumbnail */}
              <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>

              {/* Info */}
              <div className="px-2 py-1.5">
                <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
              </div>

              {/* Hover actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => copyUrl(file.id, file.url)}
                  className="h-8 w-8 rounded-lg bg-white/90 hover:bg-white flex items-center justify-center text-foreground transition-colors"
                  title="Copy URL"
                >
                  {copiedId === file.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => deleteMutation.mutate({ id: file.id })}
                  className="h-8 w-8 rounded-lg bg-white/90 hover:bg-red-50 flex items-center justify-center text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
