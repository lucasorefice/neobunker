// JSX typings for the @moq custom elements. The packages declare
// HTMLElementTagNameMap entries but not JSX.IntrinsicElements, so React/TS
// don't know about <moq-watch> et al. without this augmentation.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MoqWatchAttributes = {
  url?: string;
  name?: string;
  paused?: boolean;
  muted?: boolean;
  volume?: number | string;
  visible?: string;
  reload?: boolean;
  latency?: string;
  "catalog-format"?: string;
};

type MoqPublishAttributes = {
  url?: string;
  name?: string;
  source?: "camera" | "screen" | "file";
  muted?: boolean;
  invisible?: boolean;
  simulcast?: boolean;
  preview?: string;
  announce?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "moq-watch": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & MoqWatchAttributes,
        HTMLElement
      >;
      "moq-watch-ui": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "moq-publish": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & MoqPublishAttributes,
        HTMLElement
      >;
      "moq-publish-ui": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

export {};
