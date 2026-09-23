import { type ComponentProps } from "solid-js"

const iconPaths = (
  <>
    <rect
      x="1"
      y="1"
      width="68"
      height="68"
      rx="6"
      fill="none"
      stroke="var(--icon-strong-base)"
      stroke-width="2"
    />
    <path
      d="M20 20 L50 50 M50 20 L20 50"
      stroke="var(--icon-base)"
      stroke-width="7"
      stroke-linecap="round"
    />
  </>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 70 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {iconPaths}
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 70 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {iconPaths}
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-wordmark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <text
        x="100"
        y="30"
        text-anchor="middle"
        font-size="30"
        font-weight="500"
        font-family="var(--font-sans)"
        letter-spacing="4"
        fill="var(--icon-strong-base)"
      >
        XOCP
      </text>
    </svg>
  )
}
