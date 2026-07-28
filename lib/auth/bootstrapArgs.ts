export type BootstrapArguments =
  | {
      mode: "prepare";
      email: string;
      schoolCode: string;
      schoolName: string;
    }
  | {
      mode: "promote";
      email: string;
    };

export function parseBootstrapArguments(args: string[]): BootstrapArguments {
  if (args[0] === "prepare" && args.length === 4) {
    return {
      mode: "prepare",
      email: args[1],
      schoolCode: args[2],
      schoolName: args[3]
    };
  }
  if (args[0] === "promote" && args.length === 2) {
    return { mode: "promote", email: args[1] };
  }

  // npm 11 may consume option names such as --prepare/--email and forward only
  // their values. Supporting this shape makes the previously documented command
  // fail safely into the intended operation instead of misreading the email.
  if (args.length === 3 && args[0].includes("@")) {
    return {
      mode: "prepare",
      email: args[0],
      schoolCode: args[1],
      schoolName: args[2]
    };
  }
  if (args.length === 1 && args[0].includes("@")) {
    return { mode: "promote", email: args[0] };
  }

  throw new Error(
    'Usage: npm run admin:bootstrap -- prepare <email> <school-code> "<school-name>"'
  );
}
