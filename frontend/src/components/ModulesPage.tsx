import React, { useState } from "react";
import * as auth from "../lib/auth";
import { useAuth } from "../contexts/AuthContext";
import { Badge } from "./ui/badge";
import { Plus, Layers, Trash2, Pencil, X, Check, Phone } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { Skeleton } from "./ui/skeleton";
import CreateModule from "./CreateModule";

type QuestionObject = {
  question: string;
  order: number;
  required: boolean;
  _id?: string;
};

const ModulesPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { selectedModuleId: selectedModule, setSelectedModuleId: setSelectedModule } = useAppStore();
  const [createModuleOpen, setCreateModuleOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [editing, setEditing] = useState<{ [moduleId: string]: number | null }>({});
  const [editValue, setEditValue] = useState<{ [moduleId: string]: string }>({});
  const [newQuestion, setNewQuestion] = useState<{ [moduleId: string]: string }>({});

  const { data: modules = [], isLoading: loading, isError, error: queryError } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => {
      if (!user) return [];
      const mods = await auth.getUserModules();
      return mods.sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled: !!user,
  });

  const error = isError ? (queryError as Error).message : "";

  const deleteMutation = useMutation({
    mutationFn: auth.deleteVoiceModule,
    onSuccess: (_, id) => {
      queryClient.setQueryData(['modules'], (old: auth.VoiceModule[] | undefined) => 
        old ? old.filter(m => m.id !== id) : []
      );
      if (selectedModule === id) {
        setSelectedModule(null);
      }
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: Partial<auth.VoiceModule> }) => auth.updateVoiceModule(id, updates),
    onSuccess: (_, variables) => {
      queryClient.setQueryData(['modules'], (old: auth.VoiceModule[] | undefined) => 
        old ? old.map(m => m.id === variables.id ? { ...m, ...variables.updates } : m) : []
      );
    }
  });

  const handleDelete = (id: string) => {
    if (!id) return;
    deleteMutation.mutate(id);
  };

  const saveEdit = (mod: auth.VoiceModule, idx: number) => {
    const currentQuestion = mod.questions[idx].question;
    if (!editValue[mod.id!] || editValue[mod.id!] === currentQuestion) {
      setEditing(e => ({ ...e, [mod.id!]: null }));
      return;
    }
    const updated = [...mod.questions];
    updated[idx] = { ...updated[idx], question: editValue[mod.id!] };
    
    updateMutation.mutate({ id: mod.id!, updates: { questions: updated } }, {
      onSuccess: () => {
        setEditing(e => ({ ...e, [mod.id!]: null }));
      }
    });
  };

  const deleteQuestion = (mod: auth.VoiceModule, idx: number) => {
    if (mod.questions.length === 1) return; // Prevent deleting last question
    const updated = mod.questions.filter((_, i) => i !== idx);
    updateMutation.mutate({ id: mod.id!, updates: { questions: updated } });
  };

  const addQuestion = (mod: auth.VoiceModule) => {
    if (!newQuestion[mod.id!] || !newQuestion[mod.id!].trim()) return;
    const newQuestionObj = {
      question: newQuestion[mod.id!].trim(),
      order: mod.questions.length,
      required: true
    };
    const updated = [...mod.questions, newQuestionObj];
    updateMutation.mutate({ id: mod.id!, updates: { questions: updated } }, {
      onSuccess: () => {
        setNewQuestion(nq => ({ ...nq, [mod.id!]: "" }));
      }
    });
  };

  const handleSelectModule = (moduleId: string) => {
    setSelectedModule(moduleId);
  };

  const isDeleting = (id: string) => deleteMutation.isPending && deleteMutation.variables === id;
  const isSaving = (id: string) => updateMutation.isPending && updateMutation.variables?.id === id;

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950 px-4 sm:px-6 pt-24 pb-12">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

      <div className="w-full max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-8 sm:mb-10 text-left">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Layers className="w-5 h-5 text-blue-400" />
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Voice Agents</h1>
              </div>
              <p className="text-zinc-400 text-sm">Create, manage, and organize your AI personas</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-zinc-900 rounded-lg p-1 border border-white/5 mr-2">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                  Grid
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                  List
                </button>
              </div>
              {selectedModule && (
                <button
                  className="flex items-center gap-2 bg-transparent border border-white/[0.1] hover:bg-white/[0.05] text-zinc-300 font-medium px-3 h-9 rounded-md transition-colors text-xs"
                  onClick={() => setSelectedModule(null)}
                  title="Clear Selection"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
              <button
                className="flex items-center gap-2 bg-white hover:bg-zinc-200 text-black font-semibold px-4 h-9 rounded-md text-[13px] transition-colors"
                onClick={() => setCreateModuleOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Create Agent
              </button>
            </div>
          </div>

          {selectedModule && (
            <div className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-white/[0.04] rounded-lg">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-blue-300 font-medium">Agent selected - Ready to use</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-3 bg-zinc-900/50 border border-red-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-red-400">
              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
              {error}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-zinc-900/40 border border-white/[0.04] rounded-lg p-5 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="w-3/4 h-6 rounded-md bg-white/[0.04] animate-pulse"></div>
                    <div className="w-1/2 h-4 rounded-md bg-white/[0.04] animate-pulse"></div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] animate-pulse"></div>
                </div>
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-24 h-8 rounded-lg bg-white/[0.04] animate-pulse"></div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-1/3 h-4 rounded-md bg-white/[0.04] animate-pulse"></div>
                    <div className="w-8 h-4 rounded-md bg-white/[0.04] animate-pulse"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="w-full h-10 rounded-lg bg-white/[0.04] animate-pulse"></div>
                    <div className="w-full h-10 rounded-lg bg-white/[0.04] animate-pulse"></div>
                    <div className="w-full h-10 rounded-lg bg-white/[0.04] animate-pulse"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : modules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="p-4 bg-zinc-800/50 rounded-full mb-6">
              <Layers className="w-12 h-12 text-zinc-600" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100 mb-2">No agents found</h3>
            <p className="text-zinc-400 text-center mb-8 max-w-md">Create your first voice agent to get started with automated calling.</p>
            <button
              className="flex items-center gap-2 bg-white hover:bg-zinc-200 text-black font-semibold px-4 h-9 rounded-md transition-colors text-[13px]"
              onClick={() => navigate('/create-module')}
            >
              <Plus className="w-4 h-4" />
              Create Your First Agent
            </button>
          </div>
        ) : viewMode === 'list' ? (
            <div className="bg-zinc-900/40 border border-white/[0.04] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-400 bg-white/[0.02] border-b border-white/[0.08] uppercase">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Agent Name</th>
                      <th className="px-6 py-4 font-semibold">Configuration</th>
                      <th className="px-6 py-4 font-semibold">Questions</th>
                      <th className="px-6 py-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {modules.map((mod) => (
                      <tr key={mod.id} className={`hover:bg-white/[0.02] transition-colors ${selectedModule === mod.id ? 'bg-blue-900/10' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedModule === mod.id ? 'bg-blue-500' : 'bg-white/10'}`}>
                              <Layers className={`w-4 h-4 ${selectedModule === mod.id ? 'text-white' : 'text-zinc-400'}`} />
                            </div>
                            <div>
                              <div className="font-semibold text-white">{mod.name}</div>
                              <div className="text-xs text-zinc-500 mt-0.5">ID: {mod.id?.slice(0, 8)}...</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {mod.systemPrompt && <Badge className="bg-purple-500/20 text-purple-400 border-none text-[10px] px-2 py-0.5">Persona</Badge>}
                            {mod.ttsProvider && <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-700">{mod.ttsProvider}</Badge>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {mod.questions?.length || 0} configured
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedModule(selectedModule === mod.id ? null : mod.id!)}
                              className={`px-3 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-semibold transition-colors ${selectedModule === mod.id ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                            >
                              {selectedModule === mod.id ? 'Selected' : 'Select'}
                            </button>
                            <button
                              onClick={() => handleDelete(mod.id!)}
                              className="p-1.5 text-zinc-500 hover:text-red-400 rounded-md hover:bg-white/5 transition-colors"
                              title="Delete Agent"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {modules.map((mod) => (
              <div
                key={mod.id}
                className={`group relative bg-zinc-900/40 border rounded-lg p-5 transition-all duration-300 ${selectedModule === mod.id
                  ? 'border-zinc-500 bg-zinc-800'
                  : 'border-white/[0.04] hover:bg-zinc-900/80'
                  }`}
              >
                {/* Selection indicator */}
                {selectedModule === mod.id && (
                  <div className="absolute top-4 right-4 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-black" />
                  </div>
                )}

                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-zinc-100 truncate max-w-[200px]" title={mod.name}>
                        {mod.name}
                      </h3>
                      {mod.systemPrompt && (
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0 uppercase tracking-widest font-bold">Custom Persona</Badge>
                      )}
                      {mod.ttsProvider && (
                        <Badge variant="outline" className="text-[9px] uppercase tracking-widest text-zinc-400 border-zinc-700 bg-zinc-800/50 px-1.5 py-0">
                          {mod.ttsProvider}
                        </Badge>
                      )}
                      {mod.selectedLanguage && (
                        <Badge variant="outline" className="text-[9px] uppercase tracking-widest text-zinc-400 border-zinc-700 bg-zinc-800/50 px-1.5 py-0">
                          {mod.selectedLanguage}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                        {mod.questions.length} questions
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-zinc-500 rounded-full"></div>
                        {new Date(mod.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <button
                    className="p-2 rounded-lg hover:bg-red-500/20 transition-all duration-200 opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    onClick={() => handleDelete(mod.id!)}
                    disabled={isDeleting(mod.id!)}
                    title="Delete Module"
                  >
                    {isDeleting(mod.id!) ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400"></div>
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
                    )}
                  </button>
                </div>

                {/* Module Actions */}
                <div className="flex items-center gap-2 mb-6">
                  <button
                    className={`flex items-center gap-2 px-3 h-8 rounded-md text-[11px] uppercase tracking-wider font-semibold transition-all duration-200 ${selectedModule === mod.id
                      ? 'bg-white text-black'
                      : 'bg-transparent border border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]'
                      }`}
                    onClick={() => handleSelectModule(mod.id!)}
                  >
                    <Check className="w-4 h-4" />
                    {selectedModule === mod.id ? 'Selected' : 'Select'}
                  </button>

                  {selectedModule === mod.id && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/campaign?module=${mod.id}`)}
                        className="flex items-center gap-2 bg-transparent border border-white/[0.1] hover:bg-white/[0.05] text-white px-4 h-8 rounded-md text-xs font-semibold transition-colors"
                        title="Launch bulk call campaign"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        Launch Campaign
                      </button>
                    </div>
                  )}
                </div>

                {/* Custom Persona Detail */}
                {mod.systemPrompt && (
                  <div className="mb-4 p-3 bg-zinc-800/40 rounded-lg border border-zinc-700/50 text-xs">
                    <span className="text-zinc-300 font-medium block mb-1">Custom Persona Instructions:</span>
                    <p className="text-zinc-400 line-clamp-2" title={mod.systemPrompt}>{mod.systemPrompt}</p>
                  </div>
                )}

                {/* Questions Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-zinc-300">Agent Capabilities</h4>
                    <span className="text-xs text-zinc-500">{mod.questions.length} total</span>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {mod.questions.map((q: QuestionObject, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 p-3 rounded-lg transition-all duration-200 ${editing[mod.id!] === i
                          ? 'bg-white shadow-lg border border-blue-300'
                          : 'bg-zinc-800/50 hover:bg-zinc-800/70'
                          }`}
                      >
                        {editing[mod.id!] === i ? (
                          <>
                            <input
                              className="flex-1 text-sm text-zinc-100 bg-zinc-800/50 rounded px-3 py-2 outline-none border border-zinc-700 focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition-all"
                              value={editValue[mod.id!] ?? q.question}
                              onChange={e => setEditValue(ev => ({ ...ev, [mod.id!]: e.target.value }))}
                              autoFocus
                            />
                            <button
                              className="p-2 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-all duration-200 disabled:opacity-50"
                              onClick={() => saveEdit(mod, i)}
                              disabled={isSaving(mod.id!)}
                              title="Save"
                            >
                              {isSaving(mod.id!) ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              className="p-2 rounded-lg bg-zinc-600 hover:bg-zinc-500 text-zinc-200 transition-all duration-200"
                              onClick={() => setEditing(e => ({ ...e, [mod.id!]: null }))}
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <div
                              className="flex-1 text-sm text-zinc-200 cursor-pointer hover:text-zinc-100 transition-colors"
                              onClick={() => {
                                setEditing(e => ({ ...e, [mod.id!]: i }));
                                setEditValue(ev => ({ ...ev, [mod.id!]: q.question }));
                              }}
                            >
                              {q.question}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                className="p-1.5 rounded-lg hover:bg-blue-500/20 transition-all duration-200"
                                onClick={() => {
                                  setEditing(e => ({ ...e, [mod.id!]: i }));
                                  setEditValue(ev => ({ ...ev, [mod.id!]: q.question }));
                                }}
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3 text-blue-400" />
                              </button>
                              <button
                                className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all duration-200 disabled:opacity-50"
                                onClick={() => deleteQuestion(mod, i)}
                                disabled={mod.questions.length === 1 || isSaving(mod.id!)}
                                title={mod.questions.length === 1 ? "At least one question required" : "Delete"}
                              >
                                {isSaving(mod.id!) ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-400"></div>
                                ) : (
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                )}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add new question */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/50">
                    <Plus className="w-4 h-4 text-blue-400" />
                    <input
                      className="flex-1 text-sm text-zinc-100 bg-zinc-800/50 rounded px-3 py-2 outline-none border border-zinc-700 focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition-all placeholder-zinc-400"
                      placeholder="Add new question..."
                      value={newQuestion[mod.id!] ?? ""}
                      onChange={e => setNewQuestion(nq => ({ ...nq, [mod.id!]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addQuestion(mod); }}
                      disabled={isSaving(mod.id!)}
                    />
                    <button
                      className="p-2 rounded-lg bg-white hover:bg-zinc-200 text-black transition-all duration-200 disabled:opacity-50"
                      onClick={() => addQuestion(mod)}
                      disabled={isSaving(mod.id!) || !(newQuestion[mod.id!] && newQuestion[mod.id!].trim())}
                      title="Add Question"
                    >
                      {isSaving(mod.id!) ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <Plus className="w-4 h-4 text-inherit" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <CreateModule open={createModuleOpen} onClose={() => setCreateModuleOpen(false)} />
    </div>
  );
};

export default ModulesPage;