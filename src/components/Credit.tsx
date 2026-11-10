import type { SourceDef } from "@/lib/sources/registry";

/** One source's credit: linked name, plus licence link and changes when its licence requires them. */
export function Credit({ source }: { source: SourceDef }) {
  const { name, url, license, changes } = source.attribution;
  return (
    <>
      <a href={url} rel="noopener">
        {name}
      </a>
      {license && (
        <>
          {" "}
          (
          <a href={license.url} rel="noopener license">
            {license.name}
          </a>
          {changes && `; ${changes}`})
        </>
      )}
    </>
  );
}
