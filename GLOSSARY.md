# Marketo bulk actions

A command-line tool that runs one action against many Marketo assets at once, scoped to one Marketo instance per run.

## Language

**Instance**:
One Marketo subscription the tool can act on, known by a short name chosen by the operator (for example `sec`). Each instance has its own credentials, configuration and lists.
_Avoid_: Profile, environment, account, client

**Workspace**:
A Marketo workspace inside an instance. Naming one narrows which assets a run can find.
_Avoid_: Partition, folder

**Program**:
A Marketo program, the container a smart campaign usually lives in.

**Smart campaign**:
A Marketo smart campaign. Activating one turns its trigger on; deactivating turns it off.
_Avoid_: Campaign (bare, when a program-level campaign could be meant)

**Campaign reference**:
How the operator names a smart campaign in a run: a numeric smart campaign ID, a bare campaign name, or `Parent Name.Campaign Name`, where the parent is the owning program or, outside a program, the parent folder.
_Avoid_: Campaign path

**Campaign list**:
A document in an instance's folder holding campaign references, one per line or comma-separated.
_Avoid_: Batch, selection
