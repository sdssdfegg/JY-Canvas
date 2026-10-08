import { mimeTypeFromFile } from "./file-naming.js";

function outfitUploadFileGroups(req) {
  if (Array.isArray(req.files)) {
    return {
      imageFiles: req.files,
      maskFile: null
    };
  }
  const groups = req.files && typeof req.files === "object" ? req.files : {};
  return {
    imageFiles: Array.isArray(groups.image) ? groups.image : [],
    maskFile: Array.isArray(groups.mask) ? groups.mask[0] || null : null
  };
}

function imageFromOutfitArchive(archived) {
  if (!archived?.localUrl) return null;
  return {
    type: "url",
    value: archived.localUrl,
    localUrl: archived.localUrl,
    archiveMime: archived.archiveMime || mimeTypeFromFile(archived.filename),
    resultArchiveFile: archived.filename,
    ...(archived.sourceUrl ? { sourceUrl: archived.sourceUrl } : {})
  };
}

export {
  outfitUploadFileGroups,
  imageFromOutfitArchive
};
