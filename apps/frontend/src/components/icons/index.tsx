'use client';

import * as React from 'react';
import { HugeiconsIcon, type HugeiconsProps } from '@hugeicons/react';
import {
  Activity01Icon,
  Alert02Icon,
  AlertCircleIcon,
  Archive01Icon,
  ArchiveRestoreIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  ArrowRightDoubleIcon,
  ArrowUp01Icon,
  BookOpen01Icon,
  BotIcon,
  BrainIcon,
  Briefcase01Icon,
  Building01Icon,
  Building02Icon,
  BulbIcon,
  Calendar01Icon,
  Calendar03Icon,
  Camera01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChartColumnIcon,
  ChartDecreaseIcon,
  ChartIncreaseIcon,
  ChartLineData01Icon,
  ChatBotIcon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Clock01Icon,
  CogIcon,
  CreditCardIcon,
  DashboardSquare01Icon,
  Delete02Icon,
  Download01Icon,
  Edit01Icon,
  FactoryIcon,
  FileSpreadsheetIcon,
  FileUpIcon,
  FileXIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderKanbanIcon,
  KanbanIcon,
  FolderSyncIcon,
  GithubIcon,
  GridIcon,
  HierarchyIcon,
  Home01Icon,
  Image01Icon,
  InformationCircleIcon,
  Key01Icon,
  Layers01Icon,
  LayoutGridIcon,
  LayoutTable01Icon,
  Link04Icon,
  Linkedin01Icon,
  ListViewIcon,
  Loading03Icon,
  LockIcon,
  Logout01Icon,
  Mail01Icon,
  Maximize02Icon,
  Menu01Icon,
  Minimize02Icon,
  MinusSignIcon,
  Moon01Icon,
  Note01Icon,
  Notification01Icon,
  Package01Icon,
  PauseIcon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  PlusSignIcon,
  RefreshIcon,
  Scroll01Icon,
  Search01Icon,
  SecurityCheckIcon,
  SentIcon,
  Settings01Icon,
  Shield01Icon,
  SparklesIcon,
  StarIcon,
  Store01Icon,
  Sun01Icon,
  Task01Icon,
  TaskDone01Icon,
  Tick02Icon,
  TickDouble02Icon,
  Timer01Icon,
  TwitterIcon,
  Upload01Icon,
  UserAdd01Icon,
  UserCircleIcon,
  UserGroupIcon,
  UserIcon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';

export type IconProps = Omit<HugeiconsProps, 'icon' | 'altIcon'>;

export type LucideIcon = React.ForwardRefExoticComponent<
  IconProps & React.RefAttributes<SVGSVGElement>
>;

type IconSvg = NonNullable<HugeiconsProps['icon']>;

function makeIcon(icon: IconSvg, displayName: string): LucideIcon {
  const Component = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <HugeiconsIcon ref={ref} icon={icon} {...props} />
  ));
  Component.displayName = displayName;
  return Component;
}

export const Activity = makeIcon(Activity01Icon, 'Activity');
export const AlertCircle = makeIcon(AlertCircleIcon, 'AlertCircle');
export const AlertTriangle = makeIcon(Alert02Icon, 'AlertTriangle');
export const Archive = makeIcon(Archive01Icon, 'Archive');
export const ArchiveRestore = makeIcon(ArchiveRestoreIcon, 'ArchiveRestore');
export const ArrowLeft = makeIcon(ArrowLeft01Icon, 'ArrowLeft');
export const ArrowRight = makeIcon(ArrowRight01Icon, 'ArrowRight');
export const Ban = makeIcon(CancelCircleIcon, 'Ban');
export const BarChart3 = makeIcon(ChartColumnIcon, 'BarChart3');
export const Bell = makeIcon(Notification01Icon, 'Bell');
export const Bot = makeIcon(BotIcon, 'Bot');
export const BotMessageSquare = makeIcon(ChatBotIcon, 'BotMessageSquare');
export const BookOpen = makeIcon(BookOpen01Icon, 'BookOpen');
export const Brain = makeIcon(BrainIcon, 'Brain');
export const Briefcase = makeIcon(Briefcase01Icon, 'Briefcase');
export const Building = makeIcon(Building01Icon, 'Building');
export const Building2 = makeIcon(Building02Icon, 'Building2');
export const Calendar = makeIcon(Calendar01Icon, 'Calendar');
export const CalendarRange = makeIcon(Calendar03Icon, 'CalendarRange');
export const Camera = makeIcon(Camera01Icon, 'Camera');
export const Check = makeIcon(Tick02Icon, 'Check');
export const CheckCheck = makeIcon(TickDouble02Icon, 'CheckCheck');
export const CheckCircle = makeIcon(CheckmarkCircle02Icon, 'CheckCircle');
export const ChevronDown = makeIcon(ArrowDown01Icon, 'ChevronDown');
export const ChevronLeft = makeIcon(ArrowLeft01Icon, 'ChevronLeft');
export const ChevronRight = makeIcon(ArrowRight01Icon, 'ChevronRight');
export const ChevronsLeft = makeIcon(ArrowLeftDoubleIcon, 'ChevronsLeft');
export const ChevronsRight = makeIcon(ArrowRightDoubleIcon, 'ChevronsRight');
export const ChevronUp = makeIcon(ArrowUp01Icon, 'ChevronUp');
export const Circle = makeIcon(CircleIcon, 'Circle');
export const CircleAlert = makeIcon(AlertCircleIcon, 'CircleAlert');
export const CircleCheck = makeIcon(CheckmarkCircle02Icon, 'CircleCheck');
export const ClipboardCheck = makeIcon(TaskDone01Icon, 'ClipboardCheck');
export const ClipboardList = makeIcon(Task01Icon, 'ClipboardList');
export const Cog = makeIcon(CogIcon, 'Cog');
export const CreditCard = makeIcon(CreditCardIcon, 'CreditCard');
export const Download = makeIcon(Download01Icon, 'Download');
export const Edit = makeIcon(Edit01Icon, 'Edit');
export const ExternalLink = makeIcon(Link04Icon, 'ExternalLink');
export const Eye = makeIcon(ViewIcon, 'Eye');
export const EyeOff = makeIcon(ViewOffIcon, 'EyeOff');
export const Factory = makeIcon(FactoryIcon, 'Factory');
export const FileSpreadsheet = makeIcon(FileSpreadsheetIcon, 'FileSpreadsheet');
export const FileText = makeIcon(Note01Icon, 'FileText');
export const FileUp = makeIcon(FileUpIcon, 'FileUp');
export const FileX2 = makeIcon(FileXIcon, 'FileX2');
export const Folder = makeIcon(Folder01Icon, 'Folder');
export const FolderKanban = makeIcon(FolderKanbanIcon, 'FolderKanban');
export const Kanban = makeIcon(KanbanIcon, 'Kanban');
export const FolderPlus = makeIcon(FolderAddIcon, 'FolderPlus');
export const FolderSync = makeIcon(FolderSyncIcon, 'FolderSync');
export const Github = makeIcon(GithubIcon, 'Github');
export const Grid3x3 = makeIcon(GridIcon, 'Grid3x3');
export const History = makeIcon(Clock01Icon, 'History');
export const Home = makeIcon(Home01Icon, 'Home');
export const Image = makeIcon(Image01Icon, 'Image');
export const Info = makeIcon(InformationCircleIcon, 'Info');
export const KeyRound = makeIcon(Key01Icon, 'KeyRound');
export const Layers = makeIcon(Layers01Icon, 'Layers');
export const LayoutDashboard = makeIcon(DashboardSquare01Icon, 'LayoutDashboard');
export const LayoutGrid = makeIcon(LayoutGridIcon, 'LayoutGrid');
export const LayoutList = makeIcon(LayoutTable01Icon, 'LayoutList');
export const Lightbulb = makeIcon(BulbIcon, 'Lightbulb');
export const LineChart = makeIcon(ChartLineData01Icon, 'LineChart');
export const Linkedin = makeIcon(Linkedin01Icon, 'Linkedin');
export const List = makeIcon(ListViewIcon, 'List');
export const Loader2 = makeIcon(Loading03Icon, 'Loader2');
export const Lock = makeIcon(LockIcon, 'Lock');
export const LogOut = makeIcon(Logout01Icon, 'LogOut');
export const Mail = makeIcon(Mail01Icon, 'Mail');
export const Maximize = makeIcon(Maximize02Icon, 'Maximize');
export const Menu = makeIcon(Menu01Icon, 'Menu');
export const Minimize = makeIcon(Minimize02Icon, 'Minimize');
export const Minus = makeIcon(MinusSignIcon, 'Minus');
export const Moon = makeIcon(Moon01Icon, 'Moon');
export const Network = makeIcon(HierarchyIcon, 'Network');
export const Package = makeIcon(Package01Icon, 'Package');
export const Pause = makeIcon(PauseIcon, 'Pause');
export const Pin = makeIcon(PinIcon, 'Pin');
export const PinOff = makeIcon(PinOffIcon, 'PinOff');
export const Play = makeIcon(PlayIcon, 'Play');
export const Plus = makeIcon(PlusSignIcon, 'Plus');
export const RefreshCw = makeIcon(RefreshIcon, 'RefreshCw');
export const ScrollText = makeIcon(Scroll01Icon, 'ScrollText');
export const Search = makeIcon(Search01Icon, 'Search');
export const Send = makeIcon(SentIcon, 'Send');
export const Settings = makeIcon(Settings01Icon, 'Settings');
export const Shield = makeIcon(Shield01Icon, 'Shield');
export const ShieldCheck = makeIcon(SecurityCheckIcon, 'ShieldCheck');
export const Sparkles = makeIcon(SparklesIcon, 'Sparkles');
export const Star = makeIcon(StarIcon, 'Star');
export const Store = makeIcon(Store01Icon, 'Store');
export const Sun = makeIcon(Sun01Icon, 'Sun');
export const Timer = makeIcon(Timer01Icon, 'Timer');
export const Trash2 = makeIcon(Delete02Icon, 'Trash2');
export const TrendingDown = makeIcon(ChartDecreaseIcon, 'TrendingDown');
export const TrendingUp = makeIcon(ChartIncreaseIcon, 'TrendingUp');
export const TriangleAlert = makeIcon(Alert02Icon, 'TriangleAlert');
export const Twitter = makeIcon(TwitterIcon, 'Twitter');
export const Upload = makeIcon(Upload01Icon, 'Upload');
export const User = makeIcon(UserIcon, 'User');
export const UserCircle = makeIcon(UserCircleIcon, 'UserCircle');
export const UserPlus = makeIcon(UserAdd01Icon, 'UserPlus');
export const Users = makeIcon(UserGroupIcon, 'Users');
export const X = makeIcon(Cancel01Icon, 'X');
